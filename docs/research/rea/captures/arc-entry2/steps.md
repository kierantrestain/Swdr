# REA scenario: arc-entry2

- Evidence: `ev_172bcbb1741412f73fd86c30eaba59f260940df55dfa0069ea6b00aaf38e82a5`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: https://app.arcstudiopro.com/continue

## 01 settle — wait_for_timeout — completed
URL: https://app.arcstudiopro.com/signup
Screenshot: `01-settle.png` sha256 `012702033830cf93…`
```yaml
- document:
  - img
  - heading "Start writing for free" [level=1]
  - paragraph: Arc Studio is the new industry standard in screenwriting. We go beyond formatting, with intuitive story building tools and real-time collaboration.
  - alert: Verification could not load. Please try again.
  - button "Retry verification"
  - group:
    - text: Email address
    - textbox "Email address"
  - button "Create an account" [disabled]
  - text: or
  - button "Sign in with Apple":
    - img
    - text: Sign in with Apple
  - button "Sign in with Google":
    - img
    - text: Sign in with Google
  - text: By creating an account or clicking "Sign in/up with Apple/Google" you acknowledge that you have read and agree with our
  - link "Terms and Conditions":
    - /url: https://www.arcstudiopro.com/terms
  - text: and
  - link "Privacy Policy.":
    - /url: https://www.arcstudiopro.com/privacy
  - text: Have an account?
  - button "Sign in"
  - img
  - button "Skip Step" [disabled]
  - button "Exit Guide"
```
