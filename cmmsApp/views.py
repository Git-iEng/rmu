from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse, FileResponse, Http404
from django.urls import reverse
from django.conf import settings
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.core.mail import get_connection, EmailMultiAlternatives
# <!-- Updated by Diptee on 10-Sep-2026-->
# Required for creating and validating the signed email verification token.
from django.core import signing
from django.utils import timezone
from django.contrib import messages
import requests
from django.views.decorators.http import require_POST
from django.conf import settings

from pathlib import Path
from datetime import datetime
from threading import Thread
import os, re
# CHANGE BY diptee - 10-Sep-2026: START - Imports required for Email OTP verification
import secrets
import hashlib
import hmac
import time

# CHANGE BY diptee - 10-Sep-2026: END - Imports required for Email OTP verification
 
import pandas as pd
import phonenumbers
import pycountry

from .forms import ContactForm
from .utils_contact import normalize_phone_and_country, country_name_from_alpha2

# ---------- Validation patterns ----------
NAME_RE  = re.compile(r"^[A-Za-z\s'.-]{2,}$")
PHONE_RE = re.compile(r"^\+?\d[\d\s\-()]{6,}$")


def _static_abs_path(relpath: str) -> str | None:
    """Return absolute path of a static file using Django's staticfiles finders, or None."""
    return finders.find(relpath)
# ---------- Email helpers ----------
def _send_email(subject: str, text_body: str, html_body: str | None, recipients: list[str] | None):
    """Low-level sender used by async wrappers."""
    try:
        if not recipients:
            # last-resort fallback
            fallback = getattr(settings, "EMAIL_HOST_USER", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
            recipients = [fallback] if fallback else []

        if not recipients:
            print("EMAIL WARNING: no recipients configured")
            return

        conn = get_connection(timeout=getattr(settings, "EMAIL_TIMEOUT", 15))
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "EMAIL_HOST_USER", None),
            to=recipients,
            connection=conn,
        )
        if html_body:
            msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
    except Exception as e:
        print("EMAIL ERROR:", repr(e))

def _send_demo_email_async(subject: str, text_body: str, html_body: str | None = None):
    recipients = getattr(settings, "DEMO_RECIPIENTS", None) or getattr(settings, "CONTACT_RECIPIENTS", None)
    Thread(target=_send_email, args=(subject, text_body, html_body, recipients), daemon=True).start()


def _send_contact_email_async(subject: str, text_body: str, html_body: str | None = None):
    """Fire-and-forget email for Contact form."""
    recipients = getattr(settings, "CONTACT_RECIPIENTS", None)
    Thread(target=_send_email, args=(subject, text_body, html_body, recipients), daemon=True).start()

 # CHANGE BY diptee - 10-Sep-2026: START - Email OTP backend copied/adapted from Solar website
# ============================================================
# CONTACT EMAIL OTP
# ============================================================
 
# OTP expires after 3 minutes
CONTACT_OTP_EXPIRY_SECONDS = 3 * 60
 
# User must wait 60 seconds before requesting another OTP
CONTACT_OTP_RESEND_SECONDS = 60
 
# Maximum incorrect OTP attempts
CONTACT_OTP_MAX_ATTEMPTS = 5
 
# After successful OTP verification,
# allow 15 minutes to submit the contact form
CONTACT_VERIFICATION_TOKEN_MAX_AGE = 15 * 60
 
CONTACT_OTP_SESSION_KEY = (
    "contact_email_otp"
)
 
CONTACT_VERIFIED_SESSION_KEY = (
    "contact_email_verified"
)
 
CONTACT_VERIFICATION_SALT = (
    "contact-email-verification-v1"
)
 
 
# ============================================================
# NORMALISE EMAIL
# ============================================================
 
def _normalise_email(
    email: str
) -> str:
 
    return (
        email
        or ""
    ).strip().lower()
 
 
# ============================================================
# HASH OTP
# ============================================================
 
def _hash_contact_otp(
    email: str,
    otp: str
) -> str:
 
    message = (
        f"{_normalise_email(email)}|{otp}"
    ).encode(
        "utf-8"
    )
 
 
    key = settings.SECRET_KEY.encode(
        "utf-8"
    )
 
 
    return hmac.new(
        key,
        message,
        hashlib.sha256
    ).hexdigest()
 
 
# ============================================================
# SEND OTP EMAIL
# ============================================================
 
def _send_contact_otp_email(
    email: str,
    otp: str
) -> None:
 
    subject = (
        "iEngineering Email Verification Code"
    )
 
 
    text_body = (
 
        "Hello,\n\n"
 
        "Please use the following OTP to verify "
        "your email address for your iEngineering "
        "website Enquiry.\n\n"
 
        f"Verification code: {otp}\n\n"
 
        "This OTP will expire in 3 minutes.\n\n"
 
        "If you did not request this verification, "
        "please ignore this email.\n"
 
    )
 
 
    html_body = f"""
 
    <div
        style="
            font-family:Arial,sans-serif;
            max-width:560px;
            margin:auto;
            padding:20px;
        "
    >
 
        <h2
            style="
                margin-bottom:10px;
                color:#176f73;
            "
        >
            Verify your email address
        </h2>
 
 
        <p>
            Please use the following OTP to verify
            your email address for your iEngineering
            website Enquiry.
        </p>
 
 
        <div
            style="
                font-size:30px;
                font-weight:700;
                letter-spacing:8px;
                padding:16px 20px;
                background:#f3f6f7;
                border-radius:10px;
                display:inline-block;
                margin:10px 0 18px;
            "
        >
 
            {otp}
 
        </div>
 
 
        <p>
            This OTP will expire in
            <strong>3 minutes</strong>.
        </p>
 
 
        <p
            style="
                color:#667085;
                font-size:13px;
            "
        >
            If you did not request this verification,
            please ignore this email.
        </p>
 
    </div>
 
    """
 
 
    connection = get_connection(
 
        timeout=getattr(
            settings,
            "EMAIL_TIMEOUT",
            15
        )
 
    )
 
 
    message = EmailMultiAlternatives(
 
        subject=subject,
 
        body=text_body,
 
        from_email=(
            getattr(
                settings,
                "DEFAULT_FROM_EMAIL",
                None
            )
            or
            getattr(
                settings,
                "EMAIL_HOST_USER",
                None
            )
        ),
 
        to=[email],
 
        connection=connection
 
    )
 
 
    message.attach_alternative(
        html_body,
        "text/html"
    )
 
 
    message.send(
        fail_silently=False
    )
 
 
# ============================================================
# SEND OTP EMAIL (ASYNC WRAPPER)
# ============================================================
#
# Runs _send_contact_otp_email() in a background thread so the
# HTTP request returns immediately instead of blocking on the
# SMTP handshake/send. This avoids Gunicorn/nginx timeouts when
# the mail server is slow to respond.
# ============================================================
 
def _send_contact_otp_email_async(
    email: str,
    otp: str
) -> None:
 
    Thread(
        target=_send_contact_otp_email,
        args=(
            email,
            otp
        ),
        daemon=True
    ).start()
 
 
# ============================================================
# SEND OTP API
# ============================================================
 
@require_POST
def send_email_otp(
    request
):
 
 
    email = _normalise_email(
 
        request.POST.get(
            "email"
        )
 
    )
 
 
    # --------------------------------------------------------
    # Validate email
    # --------------------------------------------------------
 
    try:
 
        validate_email(
            email
        )
 
 
    except ValidationError:
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "Please enter a valid email address."
            },
            status=400
        )
 
 
    now = int(
        time.time()
    )
 
 
    current = request.session.get(
        CONTACT_OTP_SESSION_KEY
    )
 
 
    # --------------------------------------------------------
    # Resend cooldown
    # --------------------------------------------------------
 
    if (
        current
        and
        current.get("email") == email
    ):
 
 
        sent_at = int(
            current.get(
                "sent_at",
                0
            )
        )
 
 
        remaining = (
            CONTACT_OTP_RESEND_SECONDS
            -
            (
                now
                -
                sent_at
            )
        )
 
 
        if remaining > 0:
 
            return JsonResponse(
                {
                    "ok": False,
 
                    "message":
                        f"Please wait {remaining} seconds "
                        "before requesting another OTP.",
 
                    "retry_after":
                        remaining
                },
                status=429
            )
 
 
    # --------------------------------------------------------
    # Generate random 6-digit OTP
    # --------------------------------------------------------
 
    otp = (
        f"{secrets.randbelow(1_000_000):06d}"
    )
 
 
    # --------------------------------------------------------
    # Store hashed OTP in session
    # --------------------------------------------------------
 
    request.session[
        CONTACT_OTP_SESSION_KEY
    ] = {
 
        "email":
            email,
 
        "otp_hash":
            _hash_contact_otp(
                email,
                otp
            ),
 
        "expires_at":
            now
            +
            CONTACT_OTP_EXPIRY_SECONDS,
 
        "sent_at":
            now,
 
        "attempts":
            0
 
    }
 
 
    # Previous email verification becomes invalid
 
    request.session.pop(
        CONTACT_VERIFIED_SESSION_KEY,
        None
    )
 
 
    request.session.modified = True
 
 
    # --------------------------------------------------------
    # Send OTP email (async, so this request returns fast and
    # does not block on the SMTP handshake/send)
    # --------------------------------------------------------
 
    _send_contact_otp_email_async(
        email,
        otp
    )
 
 
    # --------------------------------------------------------
    # Success
    # --------------------------------------------------------
 
    return JsonResponse(
        {
            "ok": True,
 
            "message":
                "OTP sent successfully. "
                "Please check your email.",
 
            "expires_in":
                CONTACT_OTP_EXPIRY_SECONDS,
 
            "resend_after":
                CONTACT_OTP_RESEND_SECONDS
        }
    )
 
 
# ============================================================
# VERIFY OTP API
# ============================================================
 
@require_POST
def verify_email_otp(
    request
):
 
 
    email = _normalise_email(
 
        request.POST.get(
            "email"
        )
 
    )
 
 
    otp = (
        request.POST.get(
            "otp"
        )
        or
        ""
    ).strip()
 
 
    # --------------------------------------------------------
    # Validate email
    # --------------------------------------------------------
 
    try:
 
        validate_email(
            email
        )
 
 
    except ValidationError:
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "Please enter a valid email address."
            },
            status=400
        )
 
 
    # --------------------------------------------------------
    # Validate OTP format
    # --------------------------------------------------------
 
    if not re.fullmatch(
        r"\d{6}",
        otp
    ):
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "Please enter the 6-digit OTP."
            },
            status=400
        )
 
 
    current = request.session.get(
        CONTACT_OTP_SESSION_KEY
    )
 
 
    # --------------------------------------------------------
    # No active OTP
    # --------------------------------------------------------
 
    if not current:
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "No active OTP was found. "
                    "Please request a new OTP."
            },
            status=400
        )
 
 
    # --------------------------------------------------------
    # Check email belongs to OTP
    # --------------------------------------------------------
 
    if (
        current.get(
            "email"
        )
        !=
        email
    ):
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "This OTP was requested for "
                    "a different email address."
            },
            status=400
        )
 
 
    now = int(
        time.time()
    )
 
 
    # --------------------------------------------------------
    # Check 3-minute expiry
    # --------------------------------------------------------
 
    if (
        now
        >
        int(
            current.get(
                "expires_at",
                0
            )
        )
    ):
 
 
        request.session.pop(
            CONTACT_OTP_SESSION_KEY,
            None
        )
 
 
        request.session.modified = True
 
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "OTP expired. "
                    "Please request a new OTP."
            },
            status=400
        )
 
 
    # --------------------------------------------------------
    # Attempts
    # --------------------------------------------------------
 
    attempts = int(
        current.get(
            "attempts",
            0
        )
    )
 
 
    if (
        attempts
        >=
        CONTACT_OTP_MAX_ATTEMPTS
    ):
 
 
        request.session.pop(
            CONTACT_OTP_SESSION_KEY,
            None
        )
 
 
        request.session.modified = True
 
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    "Too many incorrect OTP attempts. "
                    "Please request a new OTP."
            },
            status=429
        )
 
 
    # --------------------------------------------------------
    # Compare OTP securely
    # --------------------------------------------------------
 
    entered_hash = (
        _hash_contact_otp(
            email,
            otp
        )
    )
 
 
    expected_hash = (
        current.get(
            "otp_hash",
            ""
        )
    )
 
 
    if not hmac.compare_digest(
        entered_hash,
        expected_hash
    ):
 
 
        attempts += 1
 
 
        current[
            "attempts"
        ] = attempts
 
 
        request.session[
            CONTACT_OTP_SESSION_KEY
        ] = current
 
 
        request.session.modified = True
 
 
        remaining_attempts = (
            CONTACT_OTP_MAX_ATTEMPTS
            -
            attempts
        )
 
 
        if (
            remaining_attempts
            <=
            0
        ):
 
 
            request.session.pop(
                CONTACT_OTP_SESSION_KEY,
                None
            )
 
 
            request.session.modified = True
 
 
            return JsonResponse(
                {
                    "ok": False,
 
                    "message":
                        "Too many incorrect OTP attempts. "
                        "Please request a new OTP."
                },
                status=429
            )
 
 
        return JsonResponse(
            {
                "ok": False,
 
                "message":
                    f"Incorrect OTP. "
                    f"{remaining_attempts} attempt(s) remaining."
            },
            status=400
        )
 
 
    # ========================================================
    # OTP CORRECT
    # ========================================================
 
    nonce = (
        secrets.token_urlsafe(
            24
        )
    )
 
 
    request.session[
        CONTACT_VERIFIED_SESSION_KEY
    ] = {
 
        "email":
            email,
 
        "nonce":
            nonce,
 
        "verified_at":
            now
 
    }
 
 
    # OTP can only be used once
 
    request.session.pop(
        CONTACT_OTP_SESSION_KEY,
        None
    )
 
 
    request.session.modified = True
 
 
    # --------------------------------------------------------
    # Create signed verification token
    # --------------------------------------------------------
 
    verification_token = signing.dumps(
        {
            "email":
                email,
 
            "nonce":
                nonce
        },
        salt=
            CONTACT_VERIFICATION_SALT,
        compress=True
    )
 
 
    return JsonResponse(
        {
            "ok": True,
 
            "verified": True,
 
            "message":
                "Email verified successfully.",
 
            "verification_token":
                verification_token
        }
    )
 
 
# ============================================================
# CHECK VERIFIED EMAIL
# ============================================================
 
def _is_contact_email_verified(
    request,
    email: str,
    token: str
) -> bool:
 
 
    if (
        not email
        or
        not token
    ):
 
        return False
 
 
    # --------------------------------------------------------
    # Decode signed token
    # --------------------------------------------------------
 
    try:
 
        payload = signing.loads(
 
            token,
 
            salt=
                CONTACT_VERIFICATION_SALT,
 
            max_age=
                CONTACT_VERIFICATION_TOKEN_MAX_AGE
 
        )
 
 
    except (
        signing.SignatureExpired,
        signing.BadSignature
    ):
 
        return False
 
 
    session_verification = (
        request.session.get(
            CONTACT_VERIFIED_SESSION_KEY
        )
    )
 
 
    if not session_verification:
 
        return False
 
 
    email = _normalise_email(
        email
    )
 
 
    payload_email = _normalise_email(
        payload.get(
            "email"
        )
    )
 
 
    session_email = _normalise_email(
        session_verification.get(
            "email"
        )
    )
 
 
    nonce = (
        payload.get(
            "nonce"
        )
        or
        ""
    )
 
 
    session_nonce = (
        session_verification.get(
            "nonce"
        )
        or
        ""
    )
 
 
    return (
 
        hmac.compare_digest(
            email,
            payload_email
        )
 
        and
 
        hmac.compare_digest(
            email,
            session_email
        )
 
        and
 
        hmac.compare_digest(
            nonce,
            session_nonce
        )
 
    )
 
 
# ============================================================
# REMOVE VERIFICATION AFTER SUCCESSFUL SUBMIT
# ============================================================
 
def _consume_contact_email_verification(
    request
):
 
    request.session.pop(
        CONTACT_VERIFIED_SESSION_KEY,
        None
    )
 
 
    request.session.modified = True
 
 
# CHANGE BY diptee - 10-Sep-2026: END - Email OTP backend

def request_demo_view(request):
    if request.method != "POST":
        return redirect("/")
    
     # CAPTCHA check
    if not verify_recaptcha(request):
        messages.error(request, "Please complete the CAPTCHA.")
        return redirect(request.META.get("HTTP_REFERER", "/"))


    # detect ajax/fetch

    wants_json = request.headers.get("x-requested-with") == "XMLHttpRequest"
     

    full_name = request.POST.get("full_name", "").strip()
    company   = request.POST.get("company", "").strip()
    email     = request.POST.get("email", "").strip()
    phone     = request.POST.get("phone", "").strip()
    country   = request.POST.get("country", "").strip()  # "IN|+91"
    address   = request.POST.get("address", "").strip()
    message   = request.POST.get("message", "").strip()

    errors = {}
    if not NAME_RE.match(full_name):
        errors["full_name"] = "Please enter a valid full name (letters only)."
    if not company:
        errors["company"] = "Company is required."
    try:
        validate_email(email)
    except ValidationError:
        errors["email"] = "Enter a valid email."
    if not PHONE_RE.match(phone):
        errors["phone"] = "Enter a valid phone number."
    if not country:
        errors["country"] = "Select a country."

    if errors:
        # JSON mode: return errors to JS
        if wants_json:
            return JsonResponse({"ok": False, "errors": errors}, status=400)

        # normal mode: use messages + redirect back
        for msg in errors.values():
            messages.error(request, msg)
        return redirect(request.META.get("HTTP_REFERER", "/"))

    country_code, dial = (country.split("|", 1) + [""])[:2]

    ts = timezone.now().strftime("%Y-%m-%d %H:%M:%S %Z")
    subject = "New Ring Main Units Enquiry"
    text_body = (
        "A new Ring Main Units Enquiry request was submitted.\n\n"
        f"Submitted: {ts}\n"
        f"IP: {request.META.get('REMOTE_ADDR','')}\n\n"
        f"Full name: {full_name}\n"
        f"Company: {company}\n"
        f"Email: {email}\n"
        f"Phone: {phone}\n"
        f"Country: {country_code} {dial}\n"
        f"Address: {address}\n\n"
        "Message:\n"
        f"{message or '(none)'}\n"
    )

    html_body = f"""
        <h2 style="margin:0 0 8px">New Ring Main Units Enquiry Request</h2>
        <p style="margin:0 0 12px;color:#334">Submitted {ts} from {request.META.get('REMOTE_ADDR','')}</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;background:#f9fbfc">
          <tr><td><b>Full name</b></td><td>{full_name}</td></tr>
          <tr><td><b>Company</b></td><td>{company}</td></tr>
          <tr><td><b>Email</b></td><td>{email}</td></tr>
          <tr><td><b>Phone</b></td><td>{phone}</td></tr>
          <tr><td><b>Country</b></td><td>{country_code} {dial}</td></tr>
          <tr><td><b>Address</b></td><td>{address}</td></tr>
        </table>
        <p style="margin:12px 0 4px"><b>Message</b></p>
        <pre style="white-space:pre-wrap;font-family:system-ui,Segoe UI,Arial,sans-serif">{message or '(none)'}</pre>
    """

    # send email (sync call but it returns quickly since you call the thread sender)
    _send_demo_email_async(subject, text_body, html_body)

    thanks_url = reverse("cmmsApp:contact_thanks")

    # JSON mode: JS will redirect only when ok=true
    if wants_json:
        return JsonResponse({"ok": True, "redirect": thanks_url})

    # normal mode
    return redirect(thanks_url)


def home(request):
    return render(request, "index.html", {
        "RECAPTCHA_SITE_KEY": settings.RECAPTCHA_SITE_KEY
    })



def request_demo(request):
    return render(request, "request_demo_modal.html", {
        "RECAPTCHA_SITE_KEY": settings.RECAPTCHA_SITE_KEY
    })




def contact(request):     
    return render(request, "contact.html", {
        "RECAPTCHA_SITE_KEY": settings.RECAPTCHA_SITE_KEY
    })


def about(request):       
    return render(request, "about.html", {
        "RECAPTCHA_SITE_KEY": settings.RECAPTCHA_SITE_KEY
    })

def sitemap(request):
    with staticfiles_storage.open('sitemap.xml') as sitemap_file:
        return HttpResponse(sitemap_file, content_type='application/xml')


def contact_section(request):
    form = ContactForm(request.POST or None)

    if request.method == "POST" and not form.is_valid():
        messages.error(request, "Please correct the highlighted fields and resubmit.")

    if request.method == "POST" and form.is_valid():
        cd = form.cleaned_data

        # Normalize phone & resolve country name
        e164_phone, resolved_alpha2, resolved_country_name = normalize_phone_and_country(
            cd.get("phone", ""), cd.get("country", "")
        )


        # Email body
        subject = "New website contact submission for Ring Main Units Enquiry "
        text_body = "\n".join(
            [
                "New contact submission for Ring Main Units Enquiry:",
                f"Name: {cd['first_name']} {cd.get('last_name','')}".strip(),
                f"Company: {cd.get('company','')}",
                f"Email: {cd['email']}",
                f"Country: {resolved_country_name or country_name_from_alpha2(resolved_alpha2) or cd.get('country','')}",
                f"Phone: {e164_phone or cd.get('phone','')}",
                "",
                "Message:",
                cd.get("message", ""),
            ]
        )

        _send_contact_email_async(subject, text_body, None)

        return redirect(reverse("cmmsApp:contact_thanks"))

    return render(request, "contact_section.html", {"form": form, "sent": request.GET.get("sent")})


# ---------- NEW: helper (not a view) ----------
def _dial_code_from_alpha2(alpha2: str) -> str:
    """Return '+<code>' from a country alpha2 code."""
    if not alpha2:
        return ""
    try:
        cc = phonenumbers.country_code_for_region(alpha2.upper())
        return f"+{cc}" if cc else ""
    except Exception:
        return ""


# ---------- NEW: JSON helper endpoint ----------
def phone_info(request):
    """
    Optional helper called by the form JS to keep Country <-> Phone in sync.
    Accepts ?phone=+.. OR ?country=Name/Alpha2
    Returns: e164 phone, country (full name), alpha2, dial_code, example
    """
    phone = (request.GET.get("phone") or "").strip()
    country = (request.GET.get("country") or "").strip()

    e164, resolved_alpha2, resolved_country_name = normalize_phone_and_country(phone, country)
    dial = _dial_code_from_alpha2(resolved_alpha2)

    # simple example for UI: prefill with a dial code if user typed only country
    example = ""
    if dial and phone and not phone.startswith("+"):
        example = f"{dial} 4xxxxxxxx"
    elif dial and not phone:
        example = f"{dial} 4xxxxxxxx"

    return JsonResponse({
        "e164": e164,
        "country": resolved_country_name,
        "alpha2": resolved_alpha2,
        "dial_code": dial,
        "example": example
    })


# ---------- NEW: consulting/contact form submit ----------
def contact_block_submit(request):
    """
    Handles the 'Get Free Consulting' form shown in the new block.
    - Normalizes Country <-> Phone
    - Sends email to CONTACT_RECIPIENTS
    """
    if request.method != "POST":
        return redirect(request.META.get("HTTP_REFERER", "/"))

    # CAPTCHA check
    if not verify_recaptcha(request):
        messages.error(request, "CAPTCHA verification failed. Please try again.")
        return redirect(request.META.get("HTTP_REFERER", "/"))

    # <!-- Updated by Diptee on 10-Sep-2026-->
    # Read all contact-form fields. These values are used by validation and the enquiry email.
    name = (request.POST.get("name") or "").strip()
    email = _normalise_email(request.POST.get("email") or "")
    phone = (request.POST.get("phone") or "").strip()
    country = (request.POST.get("country") or "").strip()
    service = (request.POST.get("service") or "").strip()
    message = (request.POST.get("message") or "").strip()

    # <!-- Updated by Diptee on 10-Sep-2026-->
    # Read the signed token returned after successful OTP verification.
    verification_token = (
        request.POST.get("email_verification_token")
        or ""
    ).strip()
 

    # --- Basic validation (lightweight) ---
    errors = []
    if not re.match(r"^[A-Za-z\s'.-]{2,}$", name):
        errors.append("Please enter a valid name.")
    try:
        validate_email(email)
    except ValidationError:
        errors.append("Enter a valid email address.")
    if not re.match(r"^\+?\d[\d\s\-()]{6,}$", phone):
        errors.append("Enter a valid phone number.")
    if not country and not phone.startswith("+"):
        # If there's no +code in phone, we do need a country hint
        errors.append("Please enter your country.")

    if errors:
        for e in errors:
            messages.error(request, e)
        return redirect(request.META.get("HTTP_REFERER", "/"))

    # <!-- Updated by Diptee on 10-Sep-2026-->
    # Server-side Email OTP verification.
    # Do not rely only on the disabled Send button in JavaScript.
    # The signed token and the verified session must both match this email.
    if not _is_contact_email_verified(
        request,
        email,
        verification_token
    ):
        messages.error(
            request,
            "Please verify your email address before submitting the form."
        )
 
        return redirect(
            request.META.get("HTTP_REFERER", "/")
        )
    # <!-- Updated by Diptee on 10-Sep-2026-->
    # End server-side Email OTP verification.
 
 

    # --- Normalize country/phone ---
    e164_phone, alpha2, country_name = normalize_phone_and_country(
        phone,
        country
    )
 
    # CHANGE BY diptee - 10-Sep-2026:
    # Cleaned the enquiry notification email.
    # Removed: "Email verified", duplicate dial code in brackets,
    # Service, source URL (From), and IP address.
 
    # --- Email notification ---
    subject = f"[Ring Main Units (RMU)] Consulting request: {name}"
 
    text_body = "\n".join([
        "A new consulting request was submitted for Ring Main Units (RMU):",
        f"Name: {name}",
        f"Email: {email}",
        f"Phone: {e164_phone or phone}",
        f"Country: {country_name or country}",
        "",
        "Message:",
        message or "(none)",
    ])
 
    _send_contact_email_async(
        subject,
        text_body,
        None
    )
 
    # CHANGE BY diptee - 10-Sep-2026: START - Make verification one-use after successful form submission
    _consume_contact_email_verification(
        request
    )
    # CHANGE BY diptee - 10-Sep-2026: END - Make verification one-use
 
    messages.success(
        request,
        "Thanks! Your request was submitted successfully."
    )
 
    return redirect(
        reverse("cmmsApp:contact_thanks")
    )
 
 
def country_list(request):
  """Return [{alpha2,name,dial}] sorted by name."""
  data = []
  for c in pycountry.countries:
      try:
          cc = phonenumbers.country_code_for_region(c.alpha_2)
      except Exception:
          cc = None
      if cc:
          data.append({"alpha2": c.alpha_2, "name": c.name, "dial": f"+{cc}"})
  data.sort(key=lambda x: x["name"])
  return JsonResponse(data, safe=False)
def contact_thanks(request):
    return render(request, "contact_thanks.html", {})
 
 
def verify_recaptcha(request):
    captcha_response = (request.POST.get("g-recaptcha-response") or "").strip()
    print("captcha_response:", captcha_response)
    print("captcha length:", len(captcha_response) if captcha_response else 0)
    if not captcha_response:
        print("reCAPTCHA failed: no captcha response")
        return False
    data = {
        "secret": settings.RECAPTCHA_SECRET_KEY,
        "response": captcha_response,
    }
    try:
        response = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data=data,
            timeout=10
        )
        result = response.json()
        return result.get("success", False)
    except requests.RequestException as e:
        print("reCAPTCHA request error:", str(e))
        return False
 
 