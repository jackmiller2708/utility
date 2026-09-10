# Product Specification

## 1. Purpose

Utility Platform is a private personal utility application that centralizes repetitive file and media workflows behind a web interface.

The host machine provides Linux-native capabilities. The browser provides the user interface.

## 2. Users

Initial audience: one trusted owner operating the host machine.

The system therefore does not require accounts, roles, teams, or conventional authorization.

It does require device authentication so that an unexpected device cannot invoke the utility API.

## 3. Core use cases

### Image

- Resize
- Convert format
- Compress
- Crop
- Inspect metadata
- Generate derivatives

### PDF

- Render pages to images
- Extract embedded images
- Convert pages
- Merge
- Split
- Inspect metadata

### Future media

- Extract frames
- Transcode
- Compress
- Extract audio
- Generate thumbnails

## 4. UX principle

The user should think:

"Resize this image to 1920px."

not:

"Run Sharp with these options."

The UI should expose safe, meaningful operations and hide implementation parameters unless they are genuinely useful to the user.

## 5. Private-server assumptions

- Host is normally trusted.
- Network exposure is opt-in.
- API must still authenticate every device.
- Filesystem access is constrained to configured roots/workspaces.
- Arbitrary process execution is never exposed to the browser.
