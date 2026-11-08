"""Sign in with Vercel — OAuth 2.0 / OIDC login for the SCOOP portal.

Flow: /api/auth/login -> vercel.com/oauth/authorize (PKCE S256, state, nonce)
-> /api/auth/callback (exchange code, verify state/nonce, upsert user row in
Postgres, set httpOnly session cookies) -> /api/auth/me reads the session.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets

import re

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from db import create_password_user, get_password_user_by_email, get_user_by_id, upsert_user
from passwords import hash_password, sign_session, verify_password, verify_session

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

router = APIRouter(prefix="/api/auth", tags=["auth"])

CLIENT_ID = os.environ.get("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("VERCEL_APP_CLIENT_SECRET", "")

AUTHORIZE_URL = "https://vercel.com/oauth/authorize"
TOKEN_URL = "https://api.vercel.com/login/oauth/token"
REVOKE_URL = "https://api.vercel.com/login/oauth/token/revoke"
USERINFO_URL = "https://api.vercel.com/login/oauth/userinfo"

COOKIE_KW = dict(httponly=True, secure=True, samesite="lax")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _callback_url(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/api/auth/callback"


@router.get("/login")
def login(request: Request):
    if not CLIENT_ID:
        raise HTTPException(500, "Sign in with Vercel is not configured")

    code_verifier = _b64url(secrets.token_bytes(32))
    code_challenge = _b64url(hashlib.sha256(code_verifier.encode()).digest())
    state = _b64url(secrets.token_bytes(16))
    nonce = _b64url(secrets.token_bytes(16))

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": _callback_url(request),
        "response_type": "code",
        "scope": "openid email profile",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "nonce": nonce,
    }
    resp = RedirectResponse(f"{AUTHORIZE_URL}?{httpx.QueryParams(params)}")
    resp.set_cookie("oauth_state", state, max_age=600, **COOKIE_KW)
    resp.set_cookie("oauth_nonce", nonce, max_age=600, **COOKIE_KW)
    resp.set_cookie("oauth_code_verifier", code_verifier, max_age=600, **COOKIE_KW)
    return resp


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None,
             error: str | None = None):
    def fail(reason: str):
        print(f"[auth/callback] {reason}")
        return RedirectResponse("/?auth_error=1")

    if error:
        return fail(f"oauth_error_{error}")
    if not code:
        return fail("no_code")

    stored_state = request.cookies.get("oauth_state")
    stored_nonce = request.cookies.get("oauth_nonce")
    code_verifier = request.cookies.get("oauth_code_verifier")

    if not stored_state or state != stored_state:
        return fail("state_mismatch")

    token_resp = httpx.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "code_verifier": code_verifier or "",
        "redirect_uri": _callback_url(request),
    })
    if token_resp.status_code != 200:
        return fail(f"token_exchange_{token_resp.status_code}")
    tokens = token_resp.json()

    id_token = tokens.get("id_token", "")
    try:
        payload_b64 = id_token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        id_payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        id_payload = {}

    if stored_nonce and id_payload.get("nonce") != stored_nonce:
        return fail("nonce_mismatch")

    userinfo_resp = httpx.get(USERINFO_URL, headers={
        "Authorization": f"Bearer {tokens['access_token']}"
    })
    if userinfo_resp.status_code != 200:
        return fail(f"userinfo_{userinfo_resp.status_code}")
    user = userinfo_resp.json()

    upsert_user(
        vercel_user_id=user.get("sub", ""),
        email=user.get("email"),
        name=user.get("name"),
        username=user.get("preferred_username"),
        picture=user.get("picture"),
    )

    resp = RedirectResponse("/?signed_in=1")
    resp.set_cookie("access_token", tokens["access_token"],
                     max_age=tokens.get("expires_in", 3600), **COOKIE_KW)
    if tokens.get("refresh_token"):
        resp.set_cookie("refresh_token", tokens["refresh_token"],
                         max_age=60 * 60 * 24 * 30, **COOKIE_KW)
    resp.delete_cookie("oauth_state")
    resp.delete_cookie("oauth_nonce")
    resp.delete_cookie("oauth_code_verifier")
    return resp


class SignupBody(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/signup")
def signup(body: SignupBody):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")

    user = create_password_user(email, hash_password(body.password), body.name)
    if not user:
        raise HTTPException(409, "An account with that email already exists.")

    resp = JSONResponse({"signed_in": True, "email": user["email"], "name": user["name"]})
    resp.set_cookie("session", sign_session(user["id"]),
                     max_age=60 * 60 * 24 * 30, **COOKIE_KW)
    return resp


@router.post("/login-password")
def login_password(body: LoginBody):
    email = body.email.strip().lower()
    user = get_password_user_by_email(email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password.")

    resp = JSONResponse({"signed_in": True, "email": user["email"], "name": user["name"]})
    resp.set_cookie("session", sign_session(user["id"]),
                     max_age=60 * 60 * 24 * 30, **COOKIE_KW)
    return resp


@router.get("/me")
def me(request: Request):
    session_cookie = request.cookies.get("session")
    if session_cookie:
        user_id = verify_session(session_cookie)
        user = get_user_by_id(user_id) if user_id else None
        if user:
            return {"signed_in": True, "name": user.get("name"),
                    "email": user.get("email"), "picture": user.get("picture")}

    token = request.cookies.get("access_token")
    if token:
        resp = httpx.get(USERINFO_URL, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 200:
            user = resp.json()
            return {"signed_in": True, "name": user.get("name"),
                    "email": user.get("email"), "picture": user.get("picture")}

    return JSONResponse({"signed_in": False}, status_code=401)


@router.post("/logout")
def logout(request: Request):
    token = request.cookies.get("access_token")
    if token:
        httpx.post(REVOKE_URL, data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "token": token,
        })
    resp = JSONResponse({"signed_in": False})
    resp.delete_cookie("access_token")
    resp.delete_cookie("refresh_token")
    resp.delete_cookie("session")
    return resp
