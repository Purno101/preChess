// === PRACTICE VARIABLES ===
let practiceMode = false;
let practiceLine = [];
let practiceIndex = 0;
let practiceColor = "w";
let practiceHistory = [];
let practiceQueue = [];
let waitingForUndo = false;
if (typeof globalThis.deepCopyBoard !== "function") {
  globalThis.deepCopyBoard = function(board) {

    return JSON.parse(JSON.stringify(board));
  };
}

if (typeof globalThis.algebraicToCoord !== "function") {

  globalThis.algebraicToCoord = function(al) {
    if (!al || al.length < 2) return null;
    const file = al[0].toLowerCase();
    const rank = parseInt(al[1], 10);
    if (isNaN(rank)) return null;
    const c = file.charCodeAt(0) - "a".charCodeAt(0);
    const r = 8 - rank;
    return { r, c };
  };
}

// === CONTROL PANEL SETUP ===
const controlPanel = document.getElementById("controlPanel");

// Create practice status (hidden by default, top of panel)
let practiceStatusEl = document.getElementById("practiceStatus");
if (!practiceStatusEl) {
  practiceStatusEl = document.createElement("div");
  practiceStatusEl.id = "practiceStatus";
  practiceStatusEl.style.fontWeight = "bold";
  practiceStatusEl.style.marginBottom = "8px";
  practiceStatusEl.style.display = "none"; // hidden unless in practice
  controlPanel.insertBefore(practiceStatusEl, controlPanel.firstChild);
}

const practiceBtn = getOrCreate(controlPanel, "practiceBtn", "button", "Enter Practice Mode");
const exitPracticeBtn = getOrCreate(controlPanel, "exitPracticeBtn", "button", "Exit Practice Mode");
const practiceUndoBtn = getOrCreate(controlPanel, "practiceUndoBtn", "button", "Undo Move");

// --- initial display state ---
practiceUndoBtn.style.display = "none";
exitPracticeBtn.style.display = "none";

// === EVENTS ===
practiceBtn.addEventListener("click", () => {
  if (!practiceMode) {
    startPractice(); // enter practice
  } else {
    exitPractice(); // exit practice
  }
});
exitPracticeBtn.addEventListener("click", exitPractice);
practiceUndoBtn.addEventListener("click", () => undoLastPracticeMove());

// === HELPERS ===
function getOrCreate(container, id, tag = "button", label = "") {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement(tag);
        el.id = id;
        if (tag.toLowerCase() === "button") el.textContent = label;
        container.appendChild(el);
    }
    return el;
}

function savePracticeSnapshot(moveStr = null, isComputer = false, meta = {}) {
    practiceHistory.push({
        board: deepCopyBoard(gameBoard),
        turn,
        castlingRights: { ...(typeof castlingRights !== "undefined" ? castlingRights : {}) },
        enPassant: (typeof enPassant !== "undefined" && enPassant) ? { ...enPassant } : null,
        moveStr,
        isComputer,
        meta
    });
}

function isMoveAlreadyApplied(moveStr) {
    const [fromAl, toAl] = moveStr.split("-");
    const from = algebraicToCoord(fromAl);
    const to = algebraicToCoord(toAl);

    const fromPiece = gameBoard[from.r] && gameBoard[from.r][from.c];
    const toPiece = gameBoard[to.r] && gameBoard[to.r][to.c];
    return (!fromPiece && !!toPiece);
}

// === START PRACTICE ===

function startPractice() {
    if (window.activeMode === "edit") {
        alert("You must exit Edit Mode before starting Practice.");
        return;
    }

    const repertoire = loadRepertoire();
    if (repertoire.length === 0) {
        alert("No saved lines found. Please create lines in Edit Mode first.");
        return;
    }

    if (practiceQueue.length === 0) {
        practiceQueue = repertoire.map((_, i) => i);

        for (let i = practiceQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [practiceQueue[i], practiceQueue[j]] = [practiceQueue[j], practiceQueue[i]];
        }
    }

    const idx = practiceQueue.shift();
    practiceLine = repertoire[idx].moves.slice();
    practiceIndex = 0;

    practiceColor = confirm("Do you want to practice as White? OK = White | Cancel = Black") ? "w" : "b";

    window.activeMode = "practice";
    practiceMode = true;
    practiceHistory = [];
    waitingForUndo = false;

    practiceBtn.style.display = "none";
    exitPracticeBtn.style.display = "inline-block";
    practiceUndoBtn.style.display = "none";
    practiceStatusEl.style.display = "block";
    practiceStatusEl.textContent = `Practicing "${repertoire[idx].name || "Line"}" as ${practiceColor === "w" ? "White" : "Black"}`;

    if (typeof startPosition === "function") startPosition();

    // snapshot
    savePracticeSnapshot(null, false, { initial: true });

    if (practiceColor === "b") setTimeout(computerMove, 300);
}

// === EXIT PRACTICE ===
function exitPractice() {
    practiceMode = false;
    practiceLine = [];
    practiceIndex = 0;
    waitingForUndo = false;
    window.activeMode = null;
    practiceBtn.style.display = "inline-block";
    exitPracticeBtn.style.display = "none";
    practiceUndoBtn.style.display = "none";
    practiceStatusEl.textContent = "";
    practiceStatusEl.style.display = "none";
    statusEl.textContent = "Exited Practice Mode.";
    if (typeof startPosition === "function") startPosition();
}

// === PLAYER MOVE HANDLER ===
function onPlayerMove(moveStr) {
    if (!practiceMode) return;
    if (waitingForUndo) {
        practiceStatusEl.textContent = "Please undo the incorrect move first.";
        return;
    }

    const expectedMove = practiceLine[practiceIndex];

    const [fromAl, toAl] = moveStr.split("-");
    const fromCoord = algebraicToCoord(fromAl);
    const toCoord = algebraicToCoord(toAl);
    const applied = isMoveAlreadyApplied(moveStr);

    if (moveStr === expectedMove) {
        // ✅ Correct move
        if (!applied) {
            executeMove(fromCoord, toCoord, true);
            turn = turn === "w" ? "b" : "w";
            render();
        }

        savePracticeSnapshot(moveStr, false);

        practiceIndex++;

        if (practiceIndex >= practiceLine.length) {
            practiceStatusEl.textContent = "🎉 Congrats! You completed the line!";
            practiceMode = false;
            practiceUndoBtn.style.display = "none";
            exitPracticeBtn.style.display = " inline-block";
            return;
        }

        practiceStatusEl.textContent = "✔ Correct move!";
        practiceUndoBtn.style.display = "none";

        setTimeout(() => { computerMove(); }, 300);
    } else {
        let preSnapshotSaved = false;

        if (!applied) {
            savePracticeSnapshot(null, false, { wrongPre: true });
            preSnapshotSaved = true;

            executeMove(fromCoord, toCoord, true);
            turn = turn === "w" ? "b" : "w";
            render();

        } else {
            if (practiceHistory.length > 0) {
                const lastSnap = practiceHistory[practiceHistory.length - 1];
                practiceHistory.push({
                    board: deepCopyBoard(lastSnap.board),
                    turn: lastSnap.turn,
                    castlingRights: { ...lastSnap.castlingRights },
                    enPassant: lastSnap.enPassant ? { ...lastSnap.enPassant } : null,
                    moveStr: null,
                    isComputer: false,
                    meta: { wrongPre: true }
                });
                preSnapshotSaved = true;
            } else {
                savePracticeSnapshot(null, false, { wrongPre: true, fallback: true });
                preSnapshotSaved = true;
            }
        }

        if (!preSnapshotSaved) {
            savePracticeSnapshot(null, false, { wrongPre: true, fallback: true });
        }

        waitingForUndo = true;
        practiceStatusEl.textContent = "❌ Wrong move, try again.";
        practiceUndoBtn.style.display = "inline-block";
    }
}

// === COMPUTER MOVE ===
function computerMove() {
    if (!practiceMode || practiceIndex >= practiceLine.length) return;
    if (waitingForUndo) return;

    const moveStr = practiceLine[practiceIndex];
    const [fromAl, toAl] = moveStr.split("-");
    const from = algebraicToCoord(fromAl);
    const to = algebraicToCoord(toAl);

    executeMove(from, to, true);
    turn = turn === "w" ? "b" : "w";
    render();

    savePracticeSnapshot(moveStr, true);

    practiceIndex++;

    if (practiceIndex >= practiceLine.length) {
        practiceStatusEl.textContent = "🎉 Congrats! You completed the line!";
        practiceMode = false;
        practiceUndoBtn.style.display = "none";
        exitPracticeBtn.style.display = " inline-block";
        return;
    }

    practiceStatusEl.textContent = "Computer played. Your turn!";
}

// === UNDO LAST PRACTICE MOVE ===
function undoLastPracticeMove() {
    for (let i = practiceHistory.length - 1; i >= 0; i--) {
        const snap = practiceHistory[i];
        if (!snap.isComputer && snap.meta && snap.meta.wrongPre) {
            gameBoard = deepCopyBoard(snap.board);
            turn = snap.turn;
            castlingRights = { ...snap.castlingRights };
            enPassant = snap.enPassant ? { ...snap.enPassant } : null;

            practiceHistory.splice(i, 1);

            waitingForUndo = false;
            render();

            practiceStatusEl.textContent = "Undo: try the correct move again!";
            practiceUndoBtn.style.display = "none";
            return;
        }
    }

    waitingForUndo = false;
    practiceUndoBtn.style.display = "none";
    practiceStatusEl.textContent = "Nothing to undo.";
}

// === LOAD PRACTICE LINES ===
function loadRepertoire() {
    try { return JSON.parse(localStorage.getItem("chess_repertoire") || "[]"); }
    catch (e) { return []; }
}