
'use strict';

const re = "[.1-9]".match

function validateSudoku(s:string) : boolean {
    return s.match('^[.1-9]{81}$') != null;
}

let text = <HTMLInputElement>document.getElementById('gridInput');
let solText = document.getElementById('gridSolution');
let canvas = <HTMLCanvasElement> document.getElementById('gridCanvas');

canvas.hidden = true;

var msgIdx: number = 0; // message count

interface Msg_grid {
    idx: number;
    grid: string;
}

// Display on the canvas
function displayCanvasGrid(g: string, offset: number) {
    canvas.hidden = false;
    let ctx = canvas.getContext('2d');
    ctx.font = '30px mono';

    ctx.clearRect((1+offset)*30, 30+15, 30*9+15, 30*9);

    for (let i=0; i<9; ++i) {
        for (let j=0; j<9; ++j) {
            ctx.strokeText(g.charAt(i+j*9), (i+offset) * 30+15 , (j+1)*30+15, 30);
        }
    }

}

function displaySolGrid(sol: string): void {
    if (sol == "") {
        solText.innerText = "no solution";
    } else {
        solText.innerText = `solution: ${ sol }`;
        displayCanvasGrid(sol, 10);
    }
}

function solveAsync(g: string): void {
    console.log('create worker...');
    var worker = new Worker('/sudoku_solve_wrap.js');
    solText.innerText = 'solving…';

    msgIdx ++;
    const n = msgIdx;

    // callback when the worker answers
    worker.onmessage = (_msg) => {
        const msg = <Msg_grid> _msg.data;
        if (msg.idx < msgIdx) { return; } // another grid was sent since

        displaySolGrid(msg.grid)
    }

    console.log(`send msg with idx=${ n }`);
    // send query
    worker.postMessage({idx: msgIdx, grid: g});
}

function evTextChange() {
    const grid = text.value.trim();
    const valid = validateSudoku(grid);

    if(valid) {
        console.log('update canvas with valid grid');
        displayCanvasGrid(grid, 0);
    }
}

// validate `text` and update canvas
for (let ev of ['change','input','paste']) {
    text.addEventListener(ev, evTextChange);
}

// when `solve` is clicked, validate and solve
document.getElementById('gridInputEnter').addEventListener('click', () => {
    const grid = text.value.trim();
    const valid = validateSudoku(grid);
    console.log(`input is ${ grid }, valid: ${ valid }`);

    if (valid) {
        displayCanvasGrid(grid, 0);
        solveAsync(grid)
    }
});

document.getElementById('gridInputClear').addEventListener('click', () => {
    text.value = '';
    let ctx = (<HTMLCanvasElement>canvas).getContext('2d');
    ctx.clearRect(0, 0, 500, 300);
    canvas.hidden = true;
});


{
    // generate "load" buttons for the examples
    let lst = document.getElementsByClassName('grid');
    for (let i=0; i < lst.length; ++i) {
        const x = <HTMLDivElement> lst[i];
        //console.log(x)
        
        let g = x.textContent.trim();
        console.log(g);

        // add a button that will load the grid
        const butLoad = <HTMLButtonElement> document.createElement('button');
        butLoad.textContent = 'load';
        butLoad.onclick = () => { text.value = g; evTextChange(); };
        x.appendChild(butLoad);
    }
}

