# Trilium-TocWidget

Table of contents [Trilium](https://github.com/zadam/trilium/) widget for
editable and readonly text notes.

## Screenshot

![image](https://user-images.githubusercontent.com/6446344/164298494-909a51a7-f4db-4e86-9bea-e602a6508254.png)

## Features

- The ToC is live and automatically updated as new headers are added to the note.
- Works on editable and readonly text notes.
- Clicking on the ToC navigates the note.
- Tested on Trilium Desktop 0.50.3

## Installation
- Create a code note of type JS Frontend with the contents of [TocWidget.js](TocWidget.js)
- Set the owned attributes (alt-a) to #widget

## Configuration Attributes
### In the Text Note
- noTocWidget: Set on the text notes you don't want to show the ToC for
### In the Script Note
- tocWidgetHeightPct: Percentage of pane height to use, 0 for dynamic, default
  is 30
- debugLevel: Enable output to the javascript console, default is "info"
  (without quotes): 
    - "error" no javascript console output
    - "warn" enable warn statements to the javascript console
    - "info" enable info and previous levels statements to the javascript console
    - "log" enable log and previous levels statements to the javascript console
    - "debug" enable debug and previous levels statements to the javascript console

## Bugs
- None

## Todo
- Nothing

## Discussions

https://github.com/zadam/trilium/discussions/2799
