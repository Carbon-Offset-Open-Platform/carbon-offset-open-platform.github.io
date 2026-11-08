"""Postgres (Neon) connection for persisted application data.

Separate from scoop_public.db (the bundled, read-only measurement snapshot).
This database holds data that needs real writes — starting with user
accounts created through Sign in with Vercel.
"""
from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL")

_schema_ready = False


@contextmanager
def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    con = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    with get_conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              SERIAL PRIMARY KEY,
                vercel_user_id  TEXT UNIQUE,
                email           TEXT,
                password_hash   TEXT,
                name            TEXT,
                username        TEXT,
                picture         TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_login_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        con.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT")
        con.execute("ALTER TABLE users ALTER COLUMN vercel_user_id DROP NOT NULL")
        con.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS users_email_password_idx
            ON users (lower(email)) WHERE password_hash IS NOT NULL
        """)
    _schema_ready = True


def upsert_user(vercel_user_id: str, email: str | None, name: str | None,
                 username: str | None, picture: str | None) -> dict:
    ensure_schema()
    with get_conn() as con:
        row = con.execute("""
            INSERT INTO users (vercel_user_id, email, name, username, picture)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (vercel_user_id) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                username = EXCLUDED.username,
                picture = EXCLUDED.picture,
                last_login_at = now()
            RETURNING id, vercel_user_id, email, name, username, picture, created_at
        """, (vercel_user_id, email, name, username, picture)).fetchone()
        return row


def create_password_user(email: str, password_hash: str, name: str | None) -> dict | None:
    ensure_schema()
    with get_conn() as con:
        exists = con.execute(
            "SELECT id FROM users WHERE password_hash IS NOT NULL AND lower(email) = lower(%s)",
            (email,),
        ).fetchone()
        if exists:
            return None
        row = con.execute("""
            INSERT INTO users (email, password_hash, name)
            VALUES (%s, %s, %s)
            RETURNING id, email, name, created_at
        """, (email, password_hash, name)).fetchone()
        return row


def get_password_user_by_email(email: str) -> dict | None:
    ensure_schema()
    with get_conn() as con:
        return con.execute("""
            SELECT id, email, password_hash, name, picture
            FROM users WHERE password_hash IS NOT NULL AND lower(email) = lower(%s)
        """, (email,)).fetchone()


def get_user_by_id(user_id: int) -> dict | None:
    ensure_schema()
    with get_conn() as con:
        return con.execute(
            "SELECT id, email, name, username, picture FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()


def touch_login(user_id: int) -> None:
    with get_conn() as con:
        con.execute("UPDATE users SET last_login_at = now() WHERE id = %s", (user_id,))
