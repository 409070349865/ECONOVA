"""Provision or rotate the protected ECONOVA super-administrator account."""
import os
import sys
from getpass import getpass

from app.database import SessionLocal, ensure_schema
from app.models import AuditEvent, User
from app.security import hash_password


def main() -> None:
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email:
        raise SystemExit("Set ADMIN_EMAIL in the environment; no default administrator account exists.")
    if not password:
        password = getpass("Set administrator password (input hidden): ")
        confirmation = getpass("Confirm administrator password: ")
        if password != confirmation:
            raise SystemExit("Passwords do not match.")
    if len(password) < 14:
        raise SystemExit("ADMIN_PASSWORD must be at least 14 characters.")
    if len(password) > 128:
        raise SystemExit("ADMIN_PASSWORD must not exceed 128 characters.")
    ensure_schema()
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).first()
        if user is None:
            user = User(email=email, password_hash=hash_password(password), role="SUPER_ADMIN", display_name="Atharav")
            db.add(user)
            db.flush()
            action = "admin.provisioned"
        else:
            user.password_hash = hash_password(password)
            user.role = "SUPER_ADMIN"
            user.display_name = "Atharav"
            action = "admin.credentials_rotated"
        db.add(AuditEvent(actor_user_id=user.id, action=action, target=str(user.id), details="Protected CLI administrator setup"))
        db.commit()
        print(f"ECONOVA administrator is ready: {email} (Atharav | SUPER_ADMIN)")
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Administrator provisioning failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
