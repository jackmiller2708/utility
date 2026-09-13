# Product Specification

## Purpose

Provide a private web application for common file manipulation and conversion workflows using the Linux host's native tooling.

## User model

Initial deployment is single-owner.

There are no:
- user accounts
- teams
- roles
- billing
- public registration

There is device identity because network reachability does not imply trust.

## Initial tool categories

### Image

- resize
- convert
- compress
- crop
- metadata
- derivatives

### PDF

- render pages
- extract images
- inspect metadata
- merge
- split

### Media

- inspect metadata
- transcode
- thumbnail
- extract audio

## UX principle

Expose intent, not implementation.

Good:

`Resize image → width 1920 → fit inside`

Bad:

`Run sharp with these command parameters`

## Local-first behavior

The host owns:
- uploaded files
- temporary workspaces
- generated artifacts
- native dependencies

No cloud storage is required.
