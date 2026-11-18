# REA scenario: celtx-entry

- Evidence: `ev_716d4b7425a8d52e94befbaa5b5b51462924ad65ab15c0f62dcfb18486344bd2`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: https://www.celtx.com/a/ux/logon

## 01 settle — wait_for_timeout — completed
URL: https://www.celtx.com/a/ux/logon
Screenshot: `01-settle.png` sha256 `3448bf81453cfd7a…`
```yaml
- document:
  - link:
    - /url: /
  - heading "Log in to your account" [level=2]
  - textbox "Email"
  - textbox "Password"
  - checkbox "Keep me logged in for 8 days" [checked]
  - text: Keep me logged in for 8 days
  - button "Log In"
  - text: or
  - iframe
  - text: Sign in with Microsoft By logging in you agree to our
  - link "Terms of Use":
    - /url: /company/legal/#terms
  - text: and our
  - link "Privacy Policy":
    - /url: /company/legal/#privacy
  - link "Forgot password? Trouble logging in?":
    - /url: /reset/
  - text: Don't have an account?
  - link "Sign up!":
    - /url: /?showSignUpForm=1
  - paragraph:
    - text: We use cookies to improve your experience on our site. By clicking Accept, you consent to our use of cookies. You can decline non-essential cookies by clicking Decline. For more details, see our
    - link "Privacy Policy":
      - /url: /privacy-policy
  - button "Decline"
  - button "Accept"
```

## Page errors
- service workers are blocked by scenario policy