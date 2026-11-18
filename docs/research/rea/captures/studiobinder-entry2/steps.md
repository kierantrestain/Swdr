# REA scenario: studiobinder-entry2

- Evidence: `ev_1b021d7fa9048b97118fec2b68232c2888b6b77669e57c47393f91ede82f023b`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: https://app.studiobinder.com/login

## 01 settle — wait_for_timeout — completed
URL: https://app.studiobinder.com/login
Screenshot: `01-settle.png` sha256 `eeaf37456374882d…`
```yaml
- document:
  - banner:
    - navigation:
      - link:
        - /url: https://www.studiobinder.com
      - list:
        - listitem:
          - link "Sign Up Free":
            - /url: https://app.studiobinder.com/register
        - listitem:
          - link "Login":
            - /url: https://app.studiobinder.com/login
        - listitem:
          - link "Pricing":
            - /url: https://app.studiobinder.com/pricing
        - listitem:
          - link "Blog":
            - /url: https://www.studiobinder.com/blog/
        - listitem:
          - link "Customers":
            - /url: https://www.studiobinder.com/new-media-and-corporate
        - listitem:
          - link "Features":
            - /url: https://www.studiobinder.com/call-sheet-builder
  - heading "Sign in" [level=3]
  - text: 
  - textbox "Email Address"
  - text: Email 
  - textbox "Password"
  - button " "
  - button "Sign In"
  - text: Forgot Password? Create Free Account
  - contentinfo:
    - link "StudioBinder":
      - /url: https://www.studiobinder.com
      - img "StudioBinder"
    - text: ©2026 StudioBinder Inc.
    - list:
      - listitem:
        - heading "Learn More" [level=3]
      - listitem:
        - link "Pricing & Plans":
          - /url: /pricing
      - listitem: Contact
    - list:
      - listitem:
        - heading "About" [level=3]
      - listitem:
        - link "Blog":
          - /url: https://www.studiobinder.com/blog
    - list:
      - listitem:
        - heading "Support" [level=3]
      - listitem:
        - link "Help Center":
          - /url: https://support.studiobinder.com
      - listitem:
        - link "Terms of Service":
          - /url: https://www.studiobinder.com/tos
      - listitem:
        - link "Privacy Policy":
          - /url: https://www.studiobinder.com/privacy
```
