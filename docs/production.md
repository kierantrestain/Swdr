# Production workflow

Open a screenplay or AV document and choose **Production**. Issue the writing draft or select an existing issued snapshot to start a plan. The production workspace reads that issued revision even while the writing draft changes.

- **Breakdown** records cast, crew, locations and catalogue items. Tags can cite an entire scene or a released screenplay line.
- **Shots & storyboard** groups coverage by scene. Import a project image to attach it to a shot or add it to a lookbook. Image uploads use PNG, JPEG, WebP or GIF up to 4 MB.
- **Stripboard** schedules scenes by dated shoot day and unit. Filters cover unit, location and cast. The calendar, unscheduled list and conflict details use the same plan. Edit a strip to move or remove it.
- **Sides** selects individual scenes or all scenes for a shoot day. Open a preview for browser printing or issue a text extract.
- **Call sheets** previews a dated version and checks that the shoot day has no blocking conflicts before issue. A reissue records a new version and freezes the old one. Test delivery and acknowledgement are stored separately by version and recipient.
- **Reports** calculates day out of days across units by date and costs in integer pence. Issued outputs preserve their content and the source revision. The prep manifest includes the schedule and call sheets. The wrap manifest also includes test delivery records.

Use **Script revisions** after importing a changed script. Review scene mappings and omissions before applying. A stable scene ID and an unambiguous heading can suggest a match. Omitted scenes retain historical tags and shots. A line tag whose text changed stays attached to its old source until a reviewer confirms a replacement. Pending line reviews and omitted scheduled scenes appear in the conflict panel.

## Demo journey

Open *The North Shore*, episode *Doubt*. The two days include an intentional Elias cast availability conflict. In **Breakdown → Cast & crew**, edit Elias and clear the unavailable date for the synthetic demo. Return to the stripboard to verify that the clash clears. The cost report should show £515 planned, £465 actual and £50 remaining. Nora and Elias each work the first day and Jonah works the second. Issue a call sheet, record and acknowledge a test delivery, then edit crew call and reissue. Open the first issue to verify that its crew call and acknowledgement stayed intact.

This workflow implements the StudioBinder benchmark for released-script intake, breakdown, scheduling and call-sheet versions. Delivery and acknowledgement use local test records. The calendar presents scheduled dates and units, and print layout follows the browser’s print settings. Schedule time comparisons use the shoot date and local clock, with shoots that cross midnight split into dated blocks.
