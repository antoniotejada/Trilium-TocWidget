/**
 * Table of contents widget 
 * (c) Antonio Tejada 2022
 *
 * For text notes, it will place a table of content on the left pane, below the
 * tree.
 * - The table can't be modified directly but it's automatically updated when
 *   new headings are added to the note
 * - The items in the table can be clicked to navigate the note.
 *
 * This is enabled by default for all text notes, but can be disabled by adding
 * the tag noTocWidget to a text note.
 *
 * See https://github.com/zadam/trilium/discussions/2799 for discussions
 */

const TEMPLATE = `<div style="padding: 0px; border-top: 1px solid var(--main-border-color); contain: none;">
 <span class="toc"></span>
</div>`;

const showDebug = false;
function dbg(s) {
    if (showDebug) {
        console.debug("TocWidget: " + s);
    }
}

function info(s) {
    console.info("TocWidget: " + s);
}

function debugbreak() {
    debugger;
}

class TocWidget extends api.NoteContextAwareWidget {
    get position() {
        dbg("getPosition");
        // higher value means position towards the bottom/right
        return 100;
    }

    get parentWidget() {
        dbg("getParentWidget");
        return 'left-pane';
    }

    isEnabled() {
        dbg("isEnabled");
        return super.isEnabled()
            && this.note.type === 'text'
            && !this.note.hasLabel('noTocWidget');
    }

    doRender() {
        dbg("doRender");
        this.$widget = $(TEMPLATE);
        this.$toc = this.$widget.find('.toc');
        return this.$widget;
    }

    async refreshWithNote(note) {
        dbg("refreshWithNote");
        const { content } = await note.getNoteComplement();
        const toc = this.getToc(content);

        this.$toc.html(toc);
    }

    /**
     * Builds a jquery table of contents.
     *
     * @param {String} html Note's html content
     * @returns {jquery} ordered list table of headings, nested by heading level
     *         with an onclick event that will cause the document to scroll to
     *         the desired position.
     */
    getToc(html) {
        // Regular expression for headings <h1>...</h1> using non-greedy
        // matching and backreferences
        let reHeadingTags = /<h(\d+)>(.*?)<\/h\1>/g;

        // Use jquery to build the table rather than html text, since it makes
        // it easier to set the onclick event that will be executed with the
        // right captured callback context
        let $toc = $("<ol>");
        // Note heading 2 is the first level Trilium makes available to the note
        let curLevel = 2;
        let $ols = [$toc];
        let m;
        let headingIndex = 0;
        while ((m = reHeadingTags.exec(html)) !== null) {
            //
            // Nest/unnest whatever necessary number of ordered lists
            //
            let newLevel = m[1];
            let levelDelta = newLevel - curLevel;
            if (levelDelta > 0) {
                // Open as many lists as newLevel - curLevel
                for (let i = 0; i < levelDelta; ++i) {
                    let $ol = $("<ol>");
                    $ols[$ols.length - 1].append($ol);
                    $ols.push($ol);
                }
            } else if (levelDelta < 0) {
                // Close as many lists as curLevel - newLevel 
                for (let i = 0; i < -levelDelta; ++i) {
                    $ols.pop();
                }
            }

            //
            // Create the list item and setup the click callback
            //
            let $li = $('<li style="cursor:pointer">' + m[2] + '</li>');
            // Capture the current iteration value for the callback function
            // to use it
            let capturedHeadingIndex = headingIndex;
            $li.on("click", function () {
                dbg("clicked");
                api.getActiveTabTextEditor(textEditor => {
                    // Headings appear as flattened top level children in the
                    // CKEditor document named as "heading" plus the level, eg
                    // "heading2", "heading3", "heading2", etc and not nested
                    // wrt the heading level. Just count headings sequentially
                    // to find the node we need to go to
                    const model = textEditor.model;
                    const doc = model.document;
                    const root = doc.getRoot();
                    let headingNode = null;
                    let headingNodeCount = 0;
                    for (let i = 0, child = null; ((i < root.childCount) &&
                        (headingNodeCount <= capturedHeadingIndex)); ++i) {
                        child = root.getChild(i);
                        if (child.name.startsWith("heading")) {
                            headingNodeCount++;
                            headingNode = child;
                        }

                        dbg(child);
                        dbg(child.getPath());
                    }
                    dbg("Found heading node " + headingNode);

                    // Setting the selection alone doesn't scroll to the caret,
                    // needs to be done explicitly and outside of the writer
                    // change callback so the scroll is guaranteed to happen 
                    // after the selection is updated.

                    // In addition, scrolling to a caret later in the document
                    // (ie "forward scrolls"), only scrolls barely enough to
                    // place the caret at the bottom of the screen, which is a
                    // usability issue, you would like the caret to be placed at
                    // the top or center of the screen.

                    // To work around that issue, first scroll to the end of the
                    // document, then scroll to the desired point. This causes
                    // all the scrolls to be "backward scrolls" no matter the
                    // current caret position, which places the caret at the top
                    // of the screen.

                    // XXX This could be fixed in another way by using the
                    //     underlying CKEditor5 scrollViewportToShowTarget,
                    //     which allows to provide a larger "viewportOffset",
                    //     but that has coding complications (requires calling
                    //     an internal CKEditor utils funcion and passing an
                    //     HTML element, not a CKEditor node, and CKEditor5
                    //     doesn't seem to have a straightforward way to convert
                    //     a node to an HTML element? (in CKEditor4 this was
                    //     done with $(node.$) )

                    // Scroll to the end of the note to guarantee the next
                    // scroll is a backwards scroll that places the caret at the
                    // top of the screen
                    model.change(writer => {
                        writer.setSelection(root.getChild(root.childCount - 1), 0);
                    });
                    textEditor.editing.view.scrollToTheSelection();
                    // Backwards scroll to the heading
                    model.change(writer => {
                        writer.setSelection(headingNode, 0);
                    });
                    textEditor.editing.view.scrollToTheSelection();
                });
            });
            $ols[$ols.length - 1].append($li);

            curLevel = newLevel;
            headingIndex++;
        }

        return $toc;
    }

    async entitiesReloadedEvent({ loadResults }) {
        dbg("entitiesReloadedEvent");
        if (loadResults.isNoteContentReloaded(this.noteId)) {
            this.refresh();
        }
    }
}

info("Creating TocWidget");
module.exports = new TocWidget();