# REA scenario: od-entry

- Evidence: `ev_3f0add87fff13e933b5d993d8ccc628d0d51d71f4b9d5d16e9ffe9ab8c5e6f76`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: http://127.0.0.1:5180/

## 01 settle — wait_for_timeout — completed
URL: http://127.0.0.1:5180/
Screenshot: `01-settle.png` sha256 `da274bec642fed2c…`
```yaml
- document:
  - dialog "Open Draft":
    - heading "Open Draft" [level=1]
    - paragraph: Professional screenwriting, open source.
    - text: ✎ Click the editor and start writing ↵ Press Enter on a blank line to pick element type ⇥ Tab cycles Action → Character → Dialogue
    - paragraph: How would you like to start?
    - button "📄 Blank Document Start with an empty page":
      - text: 📄
      - strong: Blank Document
      - text: Start with an empty page
    - button "🎬 Sample Script Explore with a demo screenplay":
      - text: 🎬
      - strong: Sample Script
      - text: Explore with a demo screenplay
    - button "📂 Import File .fdx, .fountain, .pdf and more":
      - text: 📂
      - strong: Import File
      - text: .fdx, .fountain, .pdf and more
    - paragraph: Explore features in the menus above
    - status
    - alert
```
