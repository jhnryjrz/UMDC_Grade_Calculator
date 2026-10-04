# UMDC Grade Calculator

A responsive academic workspace for calculating a weighted GPA from subject grades and units. The calculator supports manual entry and reviewed imports from screenshots.

## Run locally

Requires a Node.js version supported by the installed Vite release.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Use the calculator

Enter an optional subject name, grade, and units, then choose **Add subject** or press Enter. Saved subjects appear below the form. You can edit or delete each row; **Undo delete** restores the most recently deleted subject. The GPA updates whenever saved subjects change.

Grades can be from 0 to 4, including 0. Units must be greater than 0 and at most 12; decimal units are supported. GPA is the sum of each grade multiplied by its units, divided by total units. Only the displayed result is rounded to two decimal places. The app does not determine honors eligibility.

To import screenshots, choose **Import screenshots**, select up to five PNG, JPG, WebP, or GIF images, and enter a Google AI Studio API key. Choose **Scan screenshots**, then review the extracted rows. You can correct values, exclude rows, and opt in to possible duplicates. The grades affect your GPA only when you choose **Add subjects**. Closing or cancelling the dialog discards the scan draft.

The API key is kept only in the open dialog's memory. The browser sends the key and selected images directly to Google when you scan. Grades are kept in the current page session; there is no account or cloud save.

## Checks

```sh
npm test
npm run lint
npm run build
```
