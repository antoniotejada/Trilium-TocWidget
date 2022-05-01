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
 * By design there's no support for non-sensical or malformed constructs:
 * - headings inside elements (eg Trilium allows headings inside tables, but
 *   not inside lists)
 * - nested headings when using raw HTML <H2><H3></H3></H2> 
 * - malformed headings when using raw HTML <H2></H3></H2><H3> 
 * - etc.
 *
 * In those cases the generated TOC may be incorrect or the navigation may lead
 * to the wrong heading (although what "right" means in those cases is not
 * clear), but it won't crash.
 *
 * See https://github.com/zadam/trilium/discussions/2799 for discussions
 */

 function getNoteAttributeValue(note, attributeType, attributeName, defaultValue) {
    let attribute = note.getAttribute(attributeType, attributeName);
    
    let attributeValue = (attribute != null) ? attribute.value : defaultValue;

    return attributeValue;
}

const tocWidgetHeightPct = getNoteAttributeValue(api.startNote, "label", "tocWidgetHeightPct", 30);
const alwaysShowWidget = (tocWidgetHeightPct > 0);
const tocWidgetHeightPctCss = alwaysShowWidget ? `height: ${tocWidgetHeightPct}%;` : "";

const TEMPLATE = `<div style="padding: 0px; border-top: 1px solid var(--main-border-color); contain: none; overflow:auto; ${tocWidgetHeightPctCss}">
    Table of Contents
    <span class="toc"></span>
</div>`;

const tag = "TocWidget";
const debugLevels = ["error", "warn", "info", "log", "debug"];
const debugLevel = debugLevels.indexOf(getNoteAttributeValue(api.startNote, "label", 
    "debugLevel", "info"));

let warn = function() {};
if (debugLevel >= debugLevels.indexOf("warn")) {
    warn = console.warn.bind(console, tag + ": ");
}

let info = function() {};
if (debugLevel >= debugLevels.indexOf("info")) {
    info = console.info.bind(console, tag + ": ");
}

let log = function() {};
if (debugLevel >= debugLevels.indexOf("log")) {
    log = console.log.bind(console, tag + ": ");
}

let dbg = function() {};
if (debugLevel >= debugLevels.indexOf("debug")) {
    dbg = console.debug.bind(console, tag + ": ");
}

function assert(e, msg) {
    console.assert(e, tag + ": " + msg);
}

function debugbreak() {
    debugger;
}


/**
 * Find a heading node in the parent's children given its index.
 *
 * @param {Element} parent Parent node to find a headingIndex'th in.
 * @param {uint} headingIndex Index for the heading
 * @returns {Element|null} Heading node with the given index, null couldn't be
 *          found (ie malformed like nested headings, etc)
 */
function findHeadingNodeByIndex(parent, headingIndex) {
    log("Finding headingIndex " + headingIndex + " in parent " + parent.name);
    let headingNode = null;
    for (let i = 0; i < parent.childCount; ++i) {
        let child = parent.getChild(i);

        dbg("Inspecting node: " + child.name +
            ", attrs: " + Array.from(child.getAttributes()) +
            ", path: " + child.getPath());

        // Headings appear as flattened top level children in the CKEditor
        // document named as "heading" plus the level, eg "heading2",
        // "heading3", "heading2", etc and not nested wrt the heading level. If
        // a heading node is found, decrement the headingIndex until zero is
        // reached
        if (child.name.startsWith("heading")) {
            if (headingIndex == 0) {
                dbg("Found heading node " + child.name);
                headingNode = child;
                break;
            }
            headingIndex--;
        }
    }

    return headingNode;
}

function findHeadingElementByIndex(parent, headingIndex) {
    log("Finding headingIndex " + headingIndex + " in parent " + parent.innerHTML);
    let headingElement = null;
    for (let i = 0; i < parent.children.length; ++i) {
        let child = parent.children[i];

        dbg("Inspecting node: " + child.innerHTML);

        // Headings appear as flattened top level children in the DOM named as
        // "H" plus the level, eg "H2", "H3", "H2", etc and not nested wrt the
        // heading level. If a heading node is found, decrement the headingIndex
        // until zero is reached
        if (child.tagName.match(/H\d+/) !== null) {
            if (headingIndex == 0) {
                dbg("Found heading element " + child.tagName);
                headingElement = child;
                break;
            }
            headingIndex--;
        }
    }
    return headingElement;
}

/**
 * Return the active tab's element containing the HTML element that contains
 * a readonly note's HTML.
 * 
 */
function getActiveTabReadOnlyTextElement() {
    // The note's html is in the following hierarchy
    //   note-split data-ntx-id=XXXX
    //    ...
    //    note-detail-readonly-text component
    //      <styles>
    //      note-detail-readonly-text-content
    //        <html>
    // Note
    // 1. the readonly text element is not removed but hidden when readonly is
    //    toggled without reloading,
    // 2. There can also be hidden readonly text elements in inactive tabs 
    // 3. There can be more visible readonly text elements in inactive splits
    log("getActiveTabReadOnlyTextElement");

    const activeNtxId = glob.appContext.tabManager.activeNtxId;
    const readOnlyTextElement = $(".note-split[data-ntx-id=" + activeNtxId +
        "] .note-detail-readonly-text-content");

    assert(readOnlyTextElement.length == 1,
        "Duplicated element found for " + readOnlyTextElement);

    return readOnlyTextElement[0];
}

function getActiveTabTextEditor(callback) {
    log("getActiveTabTextEditor");
    // Wrapper until this commit is available
    // https://github.com/zadam/trilium/commit/11578b1bc3dda7f29a91281ec28b5fe6f6c63fef
    api.getActiveTabTextEditor(function (textEditor) {
        const textEditorNtxId = textEditor.sourceElement.parentElement.component.noteContext.ntxId;
        if (glob.appContext.tabManager.activeNtxId == textEditorNtxId) {
            callback(textEditor);
        }
    });
}

class TocWidget extends api.NoteContextAwareWidget {
    get position() {
        log("getPosition id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId);
        // higher value means position towards the bottom/right
        return 100;
    }

    get parentWidget() {
        log("getParentWidget id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId);
        return 'left-pane';
    }

    isEnabled() {
        log("isEnabled id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId);
        return super.isEnabled()
            && (alwaysShowWidget || (this.note.type === 'text'))
            && !this.note.hasLabel('noTocWidget');
    }

    doRender() {
        log("doRender id " + this.note?.noteId);
        this.$widget = $(TEMPLATE);
        this.$toc = this.$widget.find('.toc');
        return this.$widget;
    }

    async noteSwitchedEvent(eventData) {
        const {noteContext, notePath } = eventData;
        log("noteSwitchedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId + 
            " to id " + noteContext.note?.noteId + " ntxId " + noteContext.ntxId);
        return await super.noteSwitchedEvent(eventData);
    }

    async activeContextChangedEvent(eventData) {
        const {noteContext} = eventData;
        log("activeContextChangedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId + 
            " to id " + noteContext.note?.noteId + " ntxId " + noteContext.ntxId);
        return await super.activeContextChangedEvent(eventData);
    }

    async noteSwitchedAndActivatedEvent(eventData) {
        const {noteContext, notePath} = eventData;
        log("noteSwitchedAndActivatedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId + 
            " to id " + noteContext.note?.noteId + " ntxId " + noteContext.ntxId);
        return await super.noteSwitchedAndActivatedEvent(eventData);
    }

    async noteTypeMimeChangedEvent(eventData) {
        const {noteId} = eventData;
        log("noteTypeMimeChangedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId + 
            " to id " + noteId);
        return await super.noteTypeMimeChangedEvent(eventData);
    }

    async frocaReloadedEvent(eventData) {
        log("frocaReloadedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId);
        return await super.frocaReloadedEvent(eventData);
    }

    async refreshWithNote(note) {
        log("refreshWithNote id " + this.note?.noteId +  " ntxId " + this.noteContext?.ntxId + " with " + note.noteId);
        let toc = "";
        // Check for type text unconditionally in case alwaysShowWidget is set
        if (this.note.type === 'text') {
            const { content } = await note.getNoteComplement();
            toc = await this.getToc(content);
        }

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
        log("getToc");
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
        let widget = this;
        for (let m = null, headingIndex = 0; ((m = reHeadingTags.exec(html)) !== null);
            ++headingIndex) {
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
            curLevel = newLevel;

            //
            // Create the list item and setup the click callback
            //
            let $li = $('<li style="cursor:pointer">' + m[2] + '</li>');
            // XXX Do this with CSS? How to inject CSS in doRender?
            $li.hover(function () {
                $(this).css("font-weight", "bold");
            }).mouseout(function () {
                $(this).css("font-weight", "normal");
            });
            $li.on("click", async function () {
                log("clicked");
                // A readonly note can change state to "readonly disabled
                // temporarily" (ie "edit this note" button) without any
                // intervening events, do the readonly calculation at navigation
                // time and not at outline creation time
                // See https://github.com/zadam/trilium/issues/2828
                const isReadOnly = await widget.noteContext.isReadOnly();

                if (isReadOnly) {
                    let readonlyTextElement = getActiveTabReadOnlyTextElement();
                    let headingElement = findHeadingElementByIndex(readonlyTextElement, headingIndex);

                    if (headingElement != null) {
                        headingElement.scrollIntoView();
                    } else {
                        warn("Malformed HTML, unable to navigate, TOC rendering is probably wrong too.");
                    }
                } else {
                    getActiveTabTextEditor(textEditor => {
                        const model = textEditor.model;
                        const doc = model.document;
                        const root = doc.getRoot();

                        let headingNode = findHeadingNodeByIndex(root, headingIndex);

                        // headingNode could be null if the html was malformed or
                        // with headings inside elements, just ignore and don't
                        // navigate (note that the TOC rendering and other TOC
                        // entries' navigation could be wrong too)
                        if (headingNode != null) {
                            // Setting the selection alone doesn't scroll to the
                            // caret, needs to be done explicitly and outside of
                            // the writer change callback so the scroll is
                            // guaranteed to happen after the selection is
                            // updated.

                            // In addition, scrolling to a caret later in the
                            // document (ie "forward scrolls"), only scrolls
                            // barely enough to place the caret at the bottom of
                            // the screen, which is a usability issue, you would
                            // like the caret to be placed at the top or center
                            // of the screen.

                            // To work around that issue, first scroll to the
                            // end of the document, then scroll to the desired
                            // point. This causes all the scrolls to be
                            // "backward scrolls" no matter the current caret
                            // position, which places the caret at the top of
                            // the screen.

                            // XXX This could be fixed in another way by using
                            //     the underlying CKEditor5
                            //     scrollViewportToShowTarget, which allows to
                            //     provide a larger "viewportOffset", but that
                            //     has coding complications (requires calling an
                            //     internal CKEditor utils funcion and passing
                            //     an HTML element, not a CKEditor node, and
                            //     CKEditor5 doesn't seem to have a
                            //     straightforward way to convert a node to an
                            //     HTML element? (in CKEditor4 this was done
                            //     with $(node.$) )

                            // Scroll to the end of the note to guarantee the
                            // next scroll is a backwards scroll that places the
                            // caret at the top of the screen
                            model.change(writer => {
                                writer.setSelection(root.getChild(root.childCount - 1), 0);
                            });
                            textEditor.editing.view.scrollToTheSelection();
                            // Backwards scroll to the heading
                            model.change(writer => {
                                writer.setSelection(headingNode, 0);
                            });
                            textEditor.editing.view.scrollToTheSelection();
                        } else {
                            warn("Malformed HTML, unable to navigate, TOC rendering is probably wrong too.");
                        }
                    });
                }
            });
            $ols[$ols.length - 1].append($li);
        }

        return $toc;
    }

    async entitiesReloadedEvent(eventData) {
        const { loadResults } = eventData;
        log("entitiesReloadedEvent id " + this.note?.noteId + " ntxId " + this.noteContext?.ntxId);
        // The TOC needs refreshing when 
        // - the note content changes, which loadResults.isNoteContentReloaded
        //   reports
        // - the note readonly/editable changes, which
        //   loadResults.hasAttributeRelatedChanges reports
        // - the note type changes and needs to show/hide (eg text to plain
        //   text), etc which loadResults has no way to find out
        // so refresh unconditionally
        // See https://github.com/zadam/trilium/issues/2787#issuecomment-1114027030
        this.refresh();
    }
}

info(`Creating TocWidget debugLevel:${debugLevel} heightPct:${tocWidgetHeightPct}`);
module.exports = new TocWidget();