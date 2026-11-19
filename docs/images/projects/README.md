# Project pictures

Put one picture per project in this folder, named after the project's ID, as a `.jpg`:

    docs/images/projects/<project id>.jpg

The project ID is the project name in lower case with every run of other characters turned into a single dash,
for example `PP (Pool Covers)` -> `pp-pool-covers.jpg`, `WGH30 (3T Car Jacks)` -> `wgh30-3t-car-jacks.jpg`.

The easiest way is to save it from the dashboard itself: choose the picture in the picture window and click "Save picture as ..." (one-time
setup of a GitHub token, explained in that window). Without a token, the manual way to get a correctly named and sized file: on the dashboard's Projects page open a project's menu (the three dots),
choose "Picture, tags & note", pick a picture from your computer and click the download button. It is shrunk to a small JPEG
(max. 640 x 480, usually 10 to 60 KB) and named correctly; upload it here with Add file -> Upload files.

A project can also use a picture from the internet instead: write an https address or a Google Drive share link
(shared as "anyone with the link") in the `image` column of the Projects tab of the sheet (one row per project; columns
`project`, `image`, `tags`, `note`). A plain file name in that cell (for example `pool.jpg`) means the file
`docs/images/projects/pool.jpg`. See README.md, "Projects page", for how to add that tab.

Without a picture the Projects page shows a coloured badge with the project's initials.
