# REA scenario: fdcloud-entry

- Evidence: `ev_db3db4c82e25eb50e08b41552f097638402523907f577d1e812206d16c69e60f`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: https://cloud.finaldraft.com/

## 01 settle — wait_for_timeout — completed
URL: https://cloud.finaldraft.com/account/sign-in
Screenshot: `01-settle.png` sha256 `daeacd3cf2078ba7…`
```yaml
- document:
  - main:
    - dialog "Final Draft":
      - img "Final Draft"
      - heading "Final Draft" [level=2]: Final Draft ®
      - paragraph: Sign in to continue
      - group:
        - text: Email address
        - textbox "Email address"
      - button "Next" [disabled]
      - paragraph: Looking to subscribe?
      - paragraph:
        - link "See plans":
          - /url: https://www.finaldraft.com/products/final-draft-cloud
  - region "Notifications (F8)":
    - list
  - alert
```
