# Changelog

## v1.7.3 (2026-11-11)

- Clarify patch releases include security and privacy fixes
- Personalise profile permissions in stream events
- Check current permissions inside write transactions
- Remove personal attribution annotations from comments and docs
- Remove cosmetic class assertions from UI tests
- Check sign-in and privacy in browsers before publishing images
- Preserve the current database until a restore is validated
- Use server counts for comments and unread indicators
- Refresh cached identities from the server after user changes
- Use time and ID together when paging lists
- Erase email details when removing accounts
- Shorten generated moderator usernames in browser test
- Void sign-in links and codes on email confirmation
- Hide reporter identities and exclude reported authors
- Read current permissions before delivering events
- Restrict address correction to the registering browser
- Leave out an old item that a list's loaded pages do not reach
- Use one helper for each layer of paged lists
- End the oldest event stream instead of refusing a new one
- Count and place comments on pages that are not loaded
- Limit event streams per account, page comments, and stop listing directories

## v1.7.2 (2026-11-11)

- Simplify the failed-upgrade test and the start of an upgrade
- Run an upgrade's migrations in one transaction
- Limit a search query to 200 characters
- Wait for an upload before choosing the file in two upload tests

## v1.7.1 (2026-11-11)

- Recreate the live views in migration 009 for databases from v1.6.1

## v1.7.0 (2026-11-11)

- Tighten the deletion timing test, and widen the search rebuild test
- Find search entries by their number, and index replies
- Show the stored text again in an open edit when another edit of it ends
- Keep editors with the same draft in step, and keep notifications on leaving
- Make large deletions quick, and fix two faults in removing a user
- Keep unsent posts, comments and messages in the browser
- Empty the text of deleted posts, comments, messages and rooms

## v1.6.2 (2026-11-10)

- Delete an upload's temporary file after reading it
- Correct the image comments and the design document's wording
- Move timer and undo tests to Vitest, and merge the conversion browser tests
- Merge the image sweep tests, and test migration 006 for every kind of body
- Use one upload function for post images and chat attachments
- Tidy the server's image code
- Let imaging turn, resize and encode images
- Read uploads with Go's standard form handling
- Send every image that is not a photo as PNG
- Fix four small faults in uploads and previews
- Replace the image memory estimate with a pixel limit, and show old texts as stored
- Take the backfill out of migration 007, and never change user content

## v1.6.1 (2026-11-10)

- Correct the image records after the second review
- Fix the client faults that the second image review found
- Fix the server faults that the second image review found
- Record the image decisions
- Open images full screen, and load them lazily
- Convert every image in the browser, and make uploads recover
- Record the images each body uses, and check them when it is saved
- Keep images and preview cards out of bios and community texts
- Remove metadata blocks from animated GIFs
- Keep the image sweep going, and release a deleted room's picture
- Refuse images that would take too much memory to decode

## v1.6.0 (2026-11-10)

- Show upload progress in grey
- Shrink profile and room pictures before uploading
- Show images in the editor while they upload
- Turn phone photos upright on the server
- Process phone photos within a small container's memory

## v1.5.0 (2026-11-10)

- Let a link preview card span its column
- Give link preview cards a wide picture
- Show a link on its own line as a preview card, and edit links in a panel
- Fetch and keep link previews on the server
- Accept only your own images as pictures, and end a stream with its session

## v1.4.0 (2026-11-10)

- Add an emoji picker to every composer on devices with a mouse or trackpad

## v1.3.1 (2026-11-10)

- Shorten the colophon to one line and pin it to the bottom of a short feed
- Record what makes a release minor or patch

## v1.3.0 (2026-11-10)

- Close the name card when the location changes
- Show Offline as a badge in the page bar
- Rewrite architecture.md as a short design document
- Remove the pointers from code comments into architecture.md
- Show the release and the source code link at the bottom of Home's feed
- License Sweet under the AGPL, version 3 or later

## v1.2.1 (2026-11-09)

- Say that the setup page's email address is for later sign-ins

## v1.2.0 (2026-11-09)

- Show each tour card's number out of the total
- Welcome new members with a dialog and a tour
- Record the scripts that remove and update communities

## v1.1.0 (2026-11-09)

- Keep 30 days of database history, with hourly snapshots
- Let several instances share one bucket with SWEET_S3_FOLDER
- Publish the major version as an image tag
- One primary button per welcome step, and the nav starts expanded

## v1.0.1 (2026-11-09)

- Set up your account without a password, then set up your community

## v1.0.0 (2026-11-09)

- The first release.
