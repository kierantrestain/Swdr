# REA scenario: od-writing

- Evidence: `ev_0ff7ffc913e06b8d0331915b0e95a2478c5574094e96293d288fece7a6191cb7`
- Browser: Chromium 153.0.8010.12 (connect, cleanup disconnected-external)
- Completeness: incomplete

## 00 scenario_start — goto_start — completed
URL: http://127.0.0.1:5180/
Screenshot: `00-scenario_start.png` sha256 `da274bec642fed2c…`

## 01 blank — click — completed
URL: http://127.0.0.1:5180/
Screenshot: `01-blank.png` sha256 `cd098330f010b7c0…`

## 02 wait-editor — wait_for — completed
URL: http://127.0.0.1:5180/
Screenshot: `02-wait-editor.png` sha256 `cd098330f010b7c0…`

## 03 focus — click — completed
URL: http://127.0.0.1:5180/
Screenshot: `03-focus.png` sha256 `cd098330f010b7c0…`

## 04 type-heading — fill — completed
URL: http://127.0.0.1:5180/
Screenshot: `04-type-heading.png` sha256 `50a7574d92b8bc86…`

## 05 enter-after-heading — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `05-enter-after-heading.png` sha256 `50a7574d92b8bc86…`

## 06 enter1 — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `06-enter1.png` sha256 `9aeb144593eb22a6…`

## 07 type-action — fill — completed
URL: http://127.0.0.1:5180/
Screenshot: `07-type-action.png` sha256 `d3d98528c6ca4ea8…`

## 08 tab-to-character — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `08-tab-to-character.png` sha256 `b01ea71ae7bfab8d…`

## 09 type-character — fill — completed
URL: http://127.0.0.1:5180/
Screenshot: `09-type-character.png` sha256 `9af2bdc58c473835…`

## 10 enter-to-dialogue — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `10-enter-to-dialogue.png` sha256 `9d24e7f7225d7149…`

## 11 type-dialogue — fill — completed
URL: http://127.0.0.1:5180/
Screenshot: `11-type-dialogue.png` sha256 `1284f2b1ff331afe…`

## 12 enter-after-dialogue — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `12-enter-after-dialogue.png` sha256 `05177465d7e6366f…`

## 13 enter-blank-line — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `13-enter-blank-line.png` sha256 `96ca799b12489cd1…`

## 14 settle-menu — wait_for_timeout — completed
URL: http://127.0.0.1:5180/
Screenshot: `14-settle-menu.png` sha256 `5cb52fbcae79a5f7…`

## 15 escape-menu — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `15-escape-menu.png` sha256 `033c25ff2b22306c…`

## 16 ctrl2-action — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `16-ctrl2-action.png` sha256 `564744d0ad6f09e0…`

## 17 type-heading2 — fill — completed
URL: http://127.0.0.1:5180/
Screenshot: `17-type-heading2.png` sha256 `4bb88d6179d613a9…`

## 18 select-all — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `18-select-all.png` sha256 `5773f401cf2e32ce…`

## 19 copy — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `19-copy.png` sha256 `5773f401cf2e32ce…`

## 20 to-end — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `20-to-end.png` sha256 `01dc613b9b7f77bd…`

## 21 enter-paste — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `21-enter-paste.png` sha256 `ee579b073e7aa8d4…`

## 22 paste — press — completed
URL: http://127.0.0.1:5180/
Screenshot: `22-paste.png` sha256 `a464a0a02f6ab345…`

## 23 settle — wait_for_timeout — completed
URL: http://127.0.0.1:5180/
Screenshot: `23-settle.png` sha256 `c3c68be59d474726…`
```yaml
- document:
  - menubar "Application menu":
    - menuitem "File":
      - img
      - text: File
    - menuitem "Edit":
      - img
      - text: Edit
    - menuitem "Format":
      - img
      - text: Format
    - menuitem "View":
      - img
      - text: View
    - menuitem "Tools":
      - img
      - text: Tools
    - menuitem "Help":
      - img
      - text: Help
  - button "Local only":
    - img
    - text: Local only
  - group "Formatting controls":
    - button "Undo (⌘Z)":
      - img
    - button "Redo (⇧⌘Z)" [disabled]:
      - img
    - combobox "Element type": Scene Heading
    - 'button "Font Family: Courier Prime"': Courier Prime
    - combobox "Font Size": 12pt
    - button "Bold (⌘B)":
      - img
    - button "Italic (⌘I)":
      - img
    - button "Underline (⌘U)":
      - img
    - button "Strikethrough":
      - img
    - button "Subscript":
      - img
    - button "Superscript":
      - img
    - button "Text Color":
      - img
    - button "Highlight Color":
      - img
    - button "Align Left":
      - img
    - button "Align Center":
      - img
    - button "Align Right":
      - img
    - button "Justify":
      - img
    - button "Find & Replace (⌘F)":
      - img
    - button "Go to Page (⌘G)":
      - img
    - button "Script Notes":
      - img
    - button "Production Tags":
      - img
    - button "Zoom Out":
      - img
    - 'button "Zoom: 100%"': 100%
    - button "Zoom In":
      - img
  - button "Scenes"
  - button "Pages"
  - button "Locations"
  - button "Structure"
  - button "Bookmarks"
  - button "×"
  - text: Scenes 2
  - button "Filter scenes":
    - img
  - img
  - textbox "Search headings & synopses..."
  - text: 1 EXT. CLIFF PATH - CONTINUOUS
  - img
  - text: 2 EXT. CLIFF PATH - CONTINUOUS
  - img
  - separator "Resize panel"
  - text: Double-click to add a footer
  - textbox "Screenplay editor"
  - text: Untitled Screenplay Scene Heading
  - button "Est. 23s"
  - text: 60 words
  - button "0 today"
  - text: Page 1 of 1
  - status
  - alert
```
