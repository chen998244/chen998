const socket = io();

// 游戏状态
let currentRoom = null;
let isMyTurn = false;
let myBoard = [];
let opponentBoard = [];
let placedAirplanes = 0;
let myVisibleBoard = new Map();
let myAttackedCells = new Map(); // 新增：存储被攻击的格子
let currentRotation = 0; // 新增：当前旋转角度
let designedAirplanes = []; // 新增：存储设计好的飞机
let currentDesignPlane = 0; // 新增：当前设计的飞机编号
let radarUsed = false; // 新增：记录是否使用过雷达
let moveModeActive = false; // 新增：是否处于移动飞机模式
let selectedPlaneForMove = null; // 新增：当前选中的要移动的飞机
let movedPlanes = new Set(); // 新增：记录已经移动过的飞机
let originalPlanePosition = null; // 新增：记录移动前飞机的原始位置
let lastOpponentAction = null; // 新增：记录对手上回合的行动
let gameVersion = 'new'; // 新增：游戏版本

// DOM 元素
const menuScreen = document.getElementById('menu');
const roomListScreen = document.getElementById('room-list');
const gameScreen = document.getElementById('game-screen');
const designScreen = document.getElementById('design-screen');
const roomsList = document.getElementById('rooms');
const gameStatus = document.getElementById('game-status');
const designStatus = document.getElementById('design-status');
const currentPlaneSpan = document.getElementById('current-plane');

// 原版飞机设计
const originalAirplaneDesign = [
    {x: 0, y: 0, isHead: true},    // 机头
    {x: -2, y: -1},  // 机身
    {x: -1, y: -1},
    {x: 0, y: -1},
    {x: 1, y: -1},
    {x: 2, y: -1},
    {x: 0, y: -2},
    {x: -1, y: -3},
    {x: 0, y: -3},
    {x: 1, y: -3}
];

// 初始化棋盘
function initializeBoard() {
    const myBoardElement = document.querySelector('#my-board .board');
    const opponentBoardElement = document.querySelector('#opponent-board .board');
    
    myBoardElement.innerHTML = '';
    opponentBoardElement.innerHTML = '';
    
    // 移除旧的按钮（如果存在）
    const oldRotateButton = document.getElementById('rotate-button');
    const oldMoveButton = document.getElementById('move-button');
    const oldRadarButton = document.getElementById('radar-button');
    if (oldRotateButton) oldRotateButton.remove();
    if (oldMoveButton) oldMoveButton.remove();
    if (oldRadarButton) oldRadarButton.remove();
    
    // 添加旋转按钮
    const rotateButton = document.createElement('button');
    rotateButton.textContent = '旋转飞机 (R)';
    rotateButton.id = 'rotate-button';
    rotateButton.addEventListener('click', rotateAirplane);
    myBoardElement.parentElement.insertBefore(rotateButton, myBoardElement);

    // 只在新版中添加移动飞机按钮
    if (gameVersion === 'new') {
        const moveButton = document.createElement('button');
        moveButton.textContent = '移动飞机';
        moveButton.id = 'move-button';
        moveButton.disabled = true;
        moveButton.style.opacity = '0.5';
        moveButton.style.cursor = 'not-allowed';
        moveButton.addEventListener('click', toggleMoveMode);
        myBoardElement.parentElement.insertBefore(moveButton, myBoardElement);
    }

    // 只在新版中添加雷达按钮
    if (gameVersion === 'new') {
        const radarButton = document.createElement('button');
        radarButton.textContent = '使用雷达';
        radarButton.id = 'radar-button';
        radarButton.disabled = true;
        radarButton.style.opacity = '0.5';
        radarButton.style.cursor = 'not-allowed';
        radarButton.addEventListener('click', () => {
            if (isMyTurn && !radarUsed) {
                if (radarButton.classList.contains('active')) {
                    radarButton.classList.remove('active');
                    document.querySelectorAll('#opponent-board .cell').forEach(cell => {
                        cell.classList.remove('radar-mode');
                    });
                } else {
                    radarButton.classList.add('active');
                    document.querySelectorAll('#opponent-board .cell').forEach(cell => {
                        cell.classList.add('radar-mode');
                    });
                }
            }
        });
        myBoardElement.parentElement.insertBefore(radarButton, myBoardElement);
    }
    
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const myCell = document.createElement('div');
            myCell.className = 'cell';
            myCell.dataset.x = x;
            myCell.dataset.y = y;
            myCell.addEventListener('click', () => handleMyBoardClick(x, y));
            myBoardElement.appendChild(myCell);

            const opponentCell = document.createElement('div');
            opponentCell.className = 'cell';
            opponentCell.dataset.x = x;
            opponentCell.dataset.y = y;
            opponentCell.addEventListener('click', () => handleOpponentBoardClick(x, y));
            opponentBoardElement.appendChild(opponentCell);
        }
    }
    
    // 初始化时禁用对手棋盘的点击
    document.querySelectorAll('#opponent-board .cell').forEach(cell => {
        cell.style.cursor = 'not-allowed';
    });
}

// 旋转飞机
function rotateAirplane() {
    if (placedAirplanes >= 3 && !moveModeActive) return;
    currentRotation = (currentRotation + 90) % 360;
    if (moveModeActive && selectedPlaneForMove !== null) {
        // 在移动模式下更新预览
        const hoveredCell = document.querySelector('#my-board .cell:hover');
        if (hoveredCell) {
            const x = parseInt(hoveredCell.dataset.x);
            const y = parseInt(hoveredCell.dataset.y);
            showAirplanePreview(x, y, originalPlanePosition);
        }
    } else {
        updatePreview();
    }
}

// 更新预览
function updatePreview() {
    if (placedAirplanes >= 3) return; // 如果已经放置了三架飞机，不显示预览
    
    // 清除之前的预览
    document.querySelectorAll('#my-board .cell.preview').forEach(cell => {
        cell.classList.remove('preview', 'preview-head', 'preview-body');
    });
    
    // 获取当前鼠标位置的格子
    const hoveredCell = document.querySelector('#my-board .cell:hover');
    if (hoveredCell) {
        const x = parseInt(hoveredCell.dataset.x);
        const y = parseInt(hoveredCell.dataset.y);
        showAirplanePreview(x, y, designedAirplanes[placedAirplanes]);
    }
}

// 显示飞机预览
function showAirplanePreview(x, y, shapeToPreview) {
    if (placedAirplanes >= 3 && !moveModeActive) return;
    
    // 清除之前的预览
    document.querySelectorAll('#my-board .cell.preview').forEach(cell => {
        cell.classList.remove('preview', 'preview-head', 'preview-body');
    });
    
    // 获取当前设计的飞机形状
    const currentShape = shapeToPreview;
    const rotatedShape = rotateShape(currentShape, currentRotation);
    
    // 找到机头的位置
    const headPart = rotatedShape.find(part => part.isHead);
    if (!headPart) return;
    
    // 计算偏移量，使鼠标位置对应机头
    const offsetX = x - headPart.x;
    const offsetY = y - headPart.y;
    
    for (const part of rotatedShape) {
        const newX = offsetX + part.x;
        const newY = offsetY + part.y;
        
        if (newX >= 0 && newX < 10 && newY >= 0 && newY < 10) {
            const cell = document.querySelector(`#my-board .cell[data-x="${newX}"][data-y="${newY}"]`);
            if (cell) {
                cell.classList.add('preview');
                cell.classList.add(part.isHead ? 'preview-head' : 'preview-body');
            }
        }
    }
}

// 旋转形状
function rotateShape(shape, degrees) {
    return shape.map(part => {
        let x = part.x;
        let y = part.y;
        
        // 根据角度旋转
        switch (degrees) {
            case 90:
                return { x: -y, y: x, isHead: part.isHead };
            case 180:
                return { x: -x, y: -y, isHead: part.isHead };
            case 270:
                return { x: y, y: -x, isHead: part.isHead };
            default:
                return { x, y, isHead: part.isHead };
        }
    });
}

// 处理我的棋盘点击
function handleMyBoardClick(x, y) {
    if (placedAirplanes >= 3) {
        if (moveModeActive) {
            handleMoveModeClick(x, y);
        }
        return;
    }
    
    const currentShape = designedAirplanes[placedAirplanes];
    const rotatedShape = rotateShape(currentShape, currentRotation);
    if (canPlaceAirplane(x, y, rotatedShape)) {
        placeAirplane(x, y, rotatedShape);
    }
}

// 处理对手棋盘点击
function handleOpponentBoardClick(x, y) {
    console.log('点击对手棋盘:', x, y);
    console.log('是我的回合吗:', isMyTurn);
    if (!isMyTurn) {
        console.log('不是你的回合，无法攻击');
        return;
    }
    
    // 如果移动模式激活，先取消移动模式
    if (moveModeActive) {
        toggleMoveMode();
    }
    
    const cell = document.querySelector(`#opponent-board .cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell) {
        console.error('找不到目标格子');
        return;
    }
    
    if (cell.classList.contains('hit-head') || cell.classList.contains('hit-body') || cell.classList.contains('miss')) {
        console.log('这个格子已经攻击过了');
        return;
    }
    
    const radarButton = document.getElementById('radar-button');
    const isRadarMode = radarButton && radarButton.classList.contains('active');
    
    if (isRadarMode) {
        if (radarUsed) {
            console.log('已经使用过雷达了');
            return;
        }
        radarUsed = true;
        radarButton.disabled = true;
        radarButton.style.opacity = '0.5';
        radarButton.style.cursor = 'not-allowed';
        radarButton.classList.remove('active');
        document.querySelectorAll('#opponent-board .cell').forEach(cell => {
            cell.classList.remove('radar-mode');
        });
    }
    
    console.log('发送攻击请求到服务器:', {x, y, isRadar: isRadarMode});
    socket.emit('attack', currentRoom, {x, y}, isRadarMode);
}

// 检查是否可以放置飞机
function canPlaceAirplane(x, y, shape) {
    // 检查是否在棋盘范围内
    for (const part of shape) {
        const newX = x + part.x;
        const newY = y + part.y;
        
        if (newX < 0 || newX >= 10 || newY < 0 || newY >= 10) {
            return false;
        }
        
        // 如果是机头，检查是否在被攻击过的格子
        if (part.isHead) {
            const cell = document.querySelector(`#my-board .cell[data-x="${newX}"][data-y="${newY}"]`);
            if (cell.classList.contains('attacked-head') || 
                cell.classList.contains('attacked-body') || 
                cell.classList.contains('attacked-miss')) {
                return false;
            }
        }
    }
    
    // 检查是否与其他飞机重叠
    for (const airplane of myBoard) {
        // 如果是移动模式，跳过当前正在移动的飞机
        if (moveModeActive && selectedPlaneForMove !== null && 
            myBoard.indexOf(airplane) === selectedPlaneForMove) {
            continue;
        }
        
        for (const existingPart of airplane) {
            for (const part of shape) {
                const newX = x + part.x;
                const newY = y + part.y;
                if (existingPart.x === newX && existingPart.y === newY) {
                    return false;
                }
            }
        }
    }
    return true;
}

// 放置飞机
function placeAirplane(x, y, shape) {
    const airplane = shape.map(part => ({
        x: x + part.x,
        y: y + part.y,
        isHead: part.isHead || false
    }));
    
    myBoard.push(airplane);
    
    // 更新视觉效果
    for (const part of airplane) {
        const cell = document.querySelector(`#my-board .cell[data-x="${part.x}"][data-y="${part.y}"]`);
        cell.classList.remove('preview', 'preview-head', 'preview-body');
        cell.classList.add(part.isHead ? 'head' : 'body');
    }
    
    placedAirplanes++;
    
    if (placedAirplanes === 3) {
        // 清除所有预览效果
        document.querySelectorAll('#my-board .cell.preview').forEach(cell => {
            cell.classList.remove('preview', 'preview-head', 'preview-body');
        });
        // 禁用旋转按钮
        const rotateButton = document.getElementById('rotate-button');
        if (rotateButton) {
            rotateButton.disabled = true;
            rotateButton.style.opacity = '0.5';
            rotateButton.style.cursor = 'not-allowed';
        }
        // 发送飞机位置到服务器
        socket.emit('setAirplanes', currentRoom, myBoard);
        // 更新游戏状态
        gameStatus.textContent = '等待对手放置飞机...';
    } else {
        // 更新游戏状态
        gameStatus.textContent = `请放置第 ${placedAirplanes + 1} 架飞机（按R键旋转）`;
    }
}

// 更新对手棋盘的视觉效果
function updateOpponentBoard() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.querySelector(`#opponent-board .cell[data-x="${x}"][data-y="${y}"]`);
            const result = myVisibleBoard.get(`${x},${y}`);
            
            // 移除所有状态类
            cell.classList.remove('hit-head', 'hit-body', 'miss');
            
            // 添加当前状态类
            if (result) {
                if (result === 'empty') {
                    cell.classList.add('miss');
                } else if (result === 'head') {
                    cell.classList.add('hit-head');
                } else if (result === 'body') {
                    cell.classList.add('hit-body');
                }
            }
        }
    }
}

// 显示对手完整棋盘
function showOpponentFullBoard(opponentBoard) {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.querySelector(`#opponent-board .cell[data-x="${x}"][data-y="${y}"]`);
            // 移除所有状态类
            cell.classList.remove('hit-head', 'hit-body', 'miss');
            
            // 检查是否是飞机的一部分
            let isPartOfPlane = false;
            let isHead = false;
            
            for (const airplane of opponentBoard) {
                for (const part of airplane) {
                    if (part.x === x && part.y === y) {
                        isPartOfPlane = true;
                        isHead = part.isHead;
                        break;
                    }
                }
                if (isPartOfPlane) break;
            }
            
            // 设置格子样式
            if (isPartOfPlane) {
                cell.classList.add(isHead ? 'head' : 'body');
            }
        }
    }
}

// 处理游戏结束
function handleGameOver(winnerId) {
    if (winnerId === socket.id) {
        gameStatus.textContent = '恭喜！你赢了！';
    } else {
        gameStatus.textContent = '游戏结束，你输了！';
    }
    
    // 显示对手的完整棋盘
    socket.emit('getOpponentBoard', currentRoom, (opponentBoard) => {
        if (opponentBoard) {
            showOpponentFullBoard(opponentBoard);
        }
    });
    
    // 禁用对手棋盘的点击
    document.querySelectorAll('#opponent-board .cell').forEach(cell => {
        cell.style.cursor = 'not-allowed';
    });

    // 添加返回主选单按钮
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'game-over-buttons';
    
    const menuButton = document.createElement('button');
    menuButton.textContent = '返回主选单';
    menuButton.addEventListener('click', () => {
        resetGameData();
        showScreen(menuScreen);
    });
    
    buttonContainer.appendChild(menuButton);
    
    // 移除旧的按钮（如果存在）
    const oldButtons = document.querySelector('.game-over-buttons');
    if (oldButtons) {
        oldButtons.remove();
    }
    
    // 添加新按钮
    document.getElementById('game-screen').appendChild(buttonContainer);
}

// 清理游戏数据
function resetGameData() {
    // 重置游戏状态
    currentRoom = null;
    isMyTurn = false;
    myBoard = [];
    opponentBoard = [];
    placedAirplanes = 0;
    myVisibleBoard.clear();
    myAttackedCells.clear();
    currentRotation = 0;
    designedAirplanes = [];
    currentDesignPlane = 0;
    radarUsed = false;
    moveModeActive = false;
    selectedPlaneForMove = null;
    movedPlanes.clear();
    originalPlanePosition = null;
    lastOpponentAction = null;

    // 清理棋盘
    document.querySelectorAll('#my-board .cell, #opponent-board .cell').forEach(cell => {
        cell.className = 'cell';
    });

    // 清理游戏状态显示
    gameStatus.textContent = '';
    designStatus.textContent = '';

    // 重置设计棋盘
    const cells = document.querySelectorAll('#design-board .cell');
    cells.forEach(cell => {
        cell.classList.remove('design-body');
        if (cell.dataset.x === '2' && cell.dataset.y === '4') {
            cell.classList.add('design-head');
        } else {
            cell.classList.remove('design-head');
        }
    });

    // 移除游戏结束按钮
    const buttonContainer = document.querySelector('.game-over-buttons');
    if (buttonContainer) {
        buttonContainer.remove();
    }

    // 重置当前飞机计数
    currentPlaneSpan.textContent = '1';

    // 移除房间状态显示
    const roomStatus = document.getElementById('room-status');
    if (roomStatus) {
        roomStatus.remove();
    }

    // 移除对手的设计显示
    const opponentDesigns = document.querySelector('.opponent-designs');
    if (opponentDesigns) {
        opponentDesigns.remove();
    }
    
    // 移除所有按钮
    const rotateButton = document.getElementById('rotate-button');
    const moveButton = document.getElementById('move-button');
    const radarButton = document.getElementById('radar-button');
    if (rotateButton) rotateButton.remove();
    if (moveButton) moveButton.remove();
    if (radarButton) radarButton.remove();
}

// 更新我的棋盘的视觉效果
function updateMyBoard() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.querySelector(`#my-board .cell[data-x="${x}"][data-y="${y}"]`);
            const result = myAttackedCells.get(`${x},${y}`);
            
            // 移除被攻击标记
            cell.classList.remove('attacked-head', 'attacked-body', 'attacked-miss');
            
            // 添加被攻击标记，但保留原有的飞机颜色
            if (result) {
                if (result === 'empty') {
                    cell.classList.add('attacked-miss');
                } else if (result === 'head') {
                    cell.classList.add('attacked-head');
                } else if (result === 'body') {
                    cell.classList.add('attacked-body');
                }
            }
        }
    }
}

// 更新游戏状态
function updateGameStatus() {
    const moveButton = document.getElementById('move-button');
    const radarButton = document.getElementById('radar-button');
    
    if (isMyTurn) {
        let statusText = '轮到你的回合';
        if (lastOpponentAction) {
            switch (lastOpponentAction) {
                case 'attack':
                    statusText = '对手上回合进行了攻击，轮到你的回合';
                    break;
                case 'radar':
                    statusText = '对手上回合使用了雷达，轮到你的回合';
                    break;
                case 'move':
                    statusText = '对手上回合移动了飞机，轮到你的回合';
                    break;
            }
        }
        gameStatus.textContent = statusText;
        
        // 只在新版中启用移动和雷达按钮
        if (gameVersion === 'new') {
            if (moveButton) {
                moveButton.disabled = false;
                moveButton.style.opacity = '1';
                moveButton.style.cursor = 'pointer';
            }
            
            if (radarButton) {
                if (!radarUsed) {
                    radarButton.disabled = false;
                    radarButton.style.opacity = '1';
                    radarButton.style.cursor = 'pointer';
                } else {
                    radarButton.disabled = true;
                    radarButton.style.opacity = '0.5';
                    radarButton.style.cursor = 'not-allowed';
                }
            }
        }
        
        // 启用对手棋盘的点击
        document.querySelectorAll('#opponent-board .cell').forEach(cell => {
            cell.style.cursor = 'pointer';
        });
    } else {
        gameStatus.textContent = '等待对手回合';
        if (gameVersion === 'new') {
            if (moveButton) {
                moveButton.disabled = true;
                moveButton.style.opacity = '0.5';
                moveButton.style.cursor = 'not-allowed';
            }
            if (radarButton) {
                radarButton.disabled = true;
                radarButton.style.opacity = '0.5';
                radarButton.style.cursor = 'not-allowed';
            }
        }
        
        // 禁用对手棋盘的点击
        document.querySelectorAll('#opponent-board .cell').forEach(cell => {
            cell.style.cursor = 'not-allowed';
        });
    }
}

// 初始化设计棋盘
function initializeDesignBoard() {
    const designBoard = document.getElementById('design-board');
    designBoard.innerHTML = '';
    
    // 修改为 5x5 的棋盘，但机头行（y=4）只显示机头格子
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            // 如果是机头行（y=4），只创建机头格子
            if (y === 4) {
                if (x === 2) { // 机头在最後一行的中间（x=2）
                    const cell = document.createElement('div');
                    cell.className = 'cell design-head';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    designBoard.appendChild(cell);
                } else {
                    // 创建一个不可点击的空白格子
                    const cell = document.createElement('div');
                    cell.className = 'cell disabled';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    designBoard.appendChild(cell);
                }
            } else {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                cell.addEventListener('click', () => handleDesignCellClick(x, y));
                designBoard.appendChild(cell);
            }
        }
    }
}

// 处理设计棋盘的点击
function handleDesignCellClick(x, y) {
    // 不允许修改机头
    if (x === 2 && y === 4) return;
    
    const cell = document.querySelector(`#design-board .cell[data-x="${x}"][data-y="${y}"]`);
    if (cell.classList.contains('design-body')) {
        cell.classList.remove('design-body');
    } else {
        cell.classList.add('design-body');
    }
}

// 检查飞机设计是否合法
function checkAirplaneDesign() {
    const cells = document.querySelectorAll('#design-board .cell');
    const bodyCells = Array.from(cells).filter(cell => cell.classList.contains('design-body'));
    const headCell = document.querySelector('#design-board .cell.design-head');
    
    // 检查机身数量
    if (bodyCells.length < 7 || bodyCells.length > 10) {
        return { valid: false, message: '机身格子数必须在7-10之间' };
    }
    
    // 检查是否与机头相连
    const headX = parseInt(headCell.dataset.x);
    const headY = parseInt(headCell.dataset.y);
    const hasAdjacentBody = bodyCells.some(cell => {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        // 只检查机头下方的格子
        return (Math.abs(x - headX) === 1 && y === headY - 1) || 
               (x === headX && y === headY - 1);
    });
    
    if (!hasAdjacentBody) {
        return { valid: false, message: '机身必须与机头相连' };
    }
    
    // 检查左右对称性
    const bodyPositions = bodyCells.map(cell => ({
        x: parseInt(cell.dataset.x),
        y: parseInt(cell.dataset.y)
    }));
    
    // 检查每个机身格子是否都有关于中心线的对称点
    for (const pos of bodyPositions) {
        const symmetricX = 4 - pos.x; // 关于 x=2 对称
        const symmetricPos = { x: symmetricX, y: pos.y };
        
        // 检查对称点是否存在
        const hasSymmetric = bodyPositions.some(p => 
            p.x === symmetricPos.x && p.y === symmetricPos.y
        );
        
        if (!hasSymmetric) {
            return { valid: false, message: '机身必须左右对称' };
        }
    }

    // 检查是否连成一个整体
    const allCells = [{x: headX, y: headY, isHead: true}, ...bodyPositions];
    const visited = new Set();
    const queue = [{x: headX, y: headY}];
    visited.add(`${headX},${headY}`);

    while (queue.length > 0) {
        const current = queue.shift();
        
        // 检查四个方向
        const directions = [
            {dx: 1, dy: 0},  // 右
            {dx: -1, dy: 0}, // 左
            {dx: 0, dy: 1},  // 下
            {dx: 0, dy: -1}  // 上
        ];
        
        for (const dir of directions) {
            const newX = current.x + dir.dx;
            const newY = current.y + dir.dy;
            const key = `${newX},${newY}`;
            
            // 检查是否在棋盘范围内
            if (newX < 0 || newX >= 5 || newY < 0 || newY >= 5) continue;
            
            // 检查是否是飞机的一部分且未访问过
            const isPartOfPlane = allCells.some(cell => 
                cell.x === newX && cell.y === newY
            );
            
            if (isPartOfPlane && !visited.has(key)) {
                visited.add(key);
                queue.push({x: newX, y: newY});
            }
        }
    }
    
    // 检查是否所有格子都被访问到
    if (visited.size !== allCells.length) {
        return { valid: false, message: '飞机必须连成一个整体' };
    }
    
    return { valid: true };
}

// 保存设计的飞机
function saveDesignedAirplane() {
    const cells = document.querySelectorAll('#design-board .cell');
    const airplane = [];
    
    cells.forEach(cell => {
        if (cell.classList.contains('design-head') || cell.classList.contains('design-body')) {
            const x = parseInt(cell.dataset.x) - 2; // 相对於中心点的坐标
            const y = parseInt(cell.dataset.y) - 4; // 相对於机头的坐标
            airplane.push({
                x,
                y,
                isHead: cell.classList.contains('design-head')
            });
        }
    });
    
    designedAirplanes.push(airplane);
}

// 重置设计
function resetDesign() {
    const cells = document.querySelectorAll('#design-board .cell');
    cells.forEach(cell => {
        cell.classList.remove('design-body');
        if (cell.dataset.x === '2' && cell.dataset.y === '4') {
            cell.classList.add('design-head');
        } else {
            cell.classList.remove('design-head');
        }
    });
}

// 显示规则说明
function showRules(stage) {
    let rules = '';
    switch (stage) {
        case 'design':
            rules = '设计阶段规则：\n' +
                   '1. 设计3架飞机，每架飞机必须左右对称\n' +
                   '2. 机身格子数必须在7-10之间\n' +
                   '3. 机身必须与机头相连\n' +
                   '4. 飞机必须连成一个整体';
            break;
        case 'placement':
            rules = '放置阶段规则：\n' +
                   '1. 在10x10的棋盘（我的棋盘）上放置3架飞机\n' +
                   '2. 飞机可以旋转（按R键或点击旋转按钮）\n' +
                   '3. 飞机不能重叠\n' +
                   '4. 飞机不能超出棋盘范围';
            break;
        case 'battle':
            rules = '战斗阶段规则：\n' +
                   '1. 每回合可以选择攻击、使用雷达或移动飞机，每次攻击都可以知道对应格子是空的，机身或机头\n' +
                   '2. 攻击：点击对手棋盘上的格子进行攻击\n' +
                   '3. 雷达：每局游戏只能使用一次，可以攻击3x3区域\n' +
                   '4. 移动飞机：每架飞机只能移动一次，且机头被击中的飞机不能移动，机头不能移动到已被攻击的格子，移动后对手已攻击过的格子的绝对坐标不变，内容会刷新\n' +
                   '5. 击中机头：飞机被击毁\n' +
                   '6. 击中机身：飞机仍然存活\n' +
                   '7. 击毁所有敌方飞机的一方获胜';
            break;
    }
    
    // 移除旧的规则显示（如果存在）
    const oldRules = document.querySelector('.rules-container');
    if (oldRules) {
        oldRules.remove();
    }
    
    // 创建规则容器
    const rulesContainer = document.createElement('div');
    rulesContainer.className = 'rules-container';
    rulesContainer.innerHTML = `
        <h3>游戏规则</h3>
        <pre>${rules}</pre>
    `;
    
    // 根据阶段选择正确的屏幕
    let targetScreen;
    switch (stage) {
        case 'design':
            targetScreen = document.getElementById('design-screen');
            break;
        case 'placement':
        case 'battle':
            targetScreen = document.getElementById('game-screen');
            break;
    }
    
    // 添加到目标屏幕
    targetScreen.appendChild(rulesContainer);
}

// 修改相关函数，在适当的时候显示规则说明
document.getElementById('create-room').addEventListener('click', () => {
    gameVersion = document.querySelector('input[name="version"]:checked').value;
    socket.emit('createRoom', gameVersion, (roomId) => {
        currentRoom = roomId;
        console.log('创建房间成功，房间号：', roomId);
        
        if (gameVersion === 'original') {
            // 原版直接设置飞机设计并发送给服务器
            designedAirplanes = [originalAirplaneDesign, originalAirplaneDesign, originalAirplaneDesign];
            socket.emit('playerDesigned', currentRoom, designedAirplanes);
            
            // 直接进入放置阶段
            showScreen(gameScreen);
            initializeBoard();
            placedAirplanes = 0;
            myBoard = [];
            document.querySelectorAll('#my-board .cell').forEach(cell => {
                cell.style.cursor = 'pointer';
            });
            const rotateButton = document.getElementById('rotate-button');
            if (rotateButton) {
                rotateButton.disabled = false;
                rotateButton.style.opacity = '1';
                rotateButton.style.cursor = 'pointer';
            }
            gameStatus.textContent = '请放置你的飞机（按R键旋转）';
            showRules('placement');
        } else {
            // 新版进入设计阶段
            showScreen(designScreen);
            initializeDesignBoard();
            const roomStatus = document.createElement('div');
            roomStatus.id = 'room-status';
            roomStatus.className = 'room-status';
            roomStatus.textContent = `房间号：${roomId}（等待对手加入...）`;
            document.getElementById('design-screen').insertBefore(roomStatus, document.getElementById('design-container'));
            showRules('design');
        }
    });
});

// 添加刷新房间列表的功能
function refreshRoomList() {
    socket.emit('getRooms', (rooms) => {
        console.log('刷新房间列表：', rooms);
        roomsList.innerHTML = '';
        rooms.forEach(room => {
            const roomButton = document.createElement('button');
            roomButton.className = 'room-button';
            roomButton.innerHTML = `
                <div class="room-info">
                    <span class="room-id">房间 ${room.id}</span>
                    <span class="room-players">(${room.players}/2)</span>
                    <span class="room-version">${room.version === 'original' ? '原版' : '新版'}</span>
                </div>
            `;
            roomButton.addEventListener('click', () => {
                console.log('尝试加入房间：', room.id);
                currentRoom = room.id;
                gameVersion = room.version;
                socket.emit('joinRoom', room.id, (success, message) => {
                    if (success) {
                        console.log('成功加入房间：', room.id);
                        if (gameVersion === 'original') {
                            // 原版直接设置飞机设计并发送给服务器
                            designedAirplanes = [originalAirplaneDesign, originalAirplaneDesign, originalAirplaneDesign];
                            socket.emit('playerDesigned', currentRoom, designedAirplanes);
                            
                            // 直接进入放置阶段
                            showScreen(gameScreen);
                            initializeBoard();
                            placedAirplanes = 0;
                            myBoard = [];
                            document.querySelectorAll('#my-board .cell').forEach(cell => {
                                cell.style.cursor = 'pointer';
                            });
                            const rotateButton = document.getElementById('rotate-button');
                            if (rotateButton) {
                                rotateButton.disabled = false;
                                rotateButton.style.opacity = '1';
                                rotateButton.style.cursor = 'pointer';
                            }
                            gameStatus.textContent = '请放置你的飞机（按R键旋转）';
                            showRules('placement');
                        } else {
                            // 新版进入设计阶段
                            showScreen(designScreen);
                            initializeDesignBoard();
                            showRules('design');
                        }
                    } else {
                        console.log('加入房间失败：', message);
                        alert(message || '加入房间失败，请重试');
                    }
                });
            });
            roomsList.appendChild(roomButton);
        });
    });
}

// 修改加入房间按钮的点击事件
document.getElementById('join-room').addEventListener('click', () => {
    resetGameData();
    refreshRoomList();
    showScreen(roomListScreen);
});

// 添加刷新按钮的点击事件
document.getElementById('refresh-rooms').addEventListener('click', refreshRoomList);

document.getElementById('back-to-menu').addEventListener('click', () => {
    if (currentRoom) {
        // 主动离开房间
        socket.emit('leaveRoom', currentRoom);
        currentRoom = null; // 清除当前房间ID
    }
    resetGameData();
    showScreen(menuScreen);
});

document.getElementById('reset-design').addEventListener('click', resetDesign);
document.getElementById('complete-design').addEventListener('click', completeDesign);

// Socket.io 事件处理
socket.on('playerJoined', (data) => {
    const roomStatus = document.getElementById('room-status');
    if (roomStatus) {
        roomStatus.textContent = `对手已加入房间，当前玩家数：${data.playersCount}/2`;
    }
    gameStatus.textContent = '等待对手准备...';
});

// 游戏开始事件，接收对手的飞机设计（相对位置）
socket.on('gameStart', (firstTurn, opponentDesignedAirplanes) => {
    console.log('收到 gameStart 事件');
    console.log('对手飞机设计数据:', opponentDesignedAirplanes);

    isMyTurn = socket.id === firstTurn;
    updateGameStatus();
    
    // 显示战斗阶段规则
    showRules('battle');
    
    // 显示对手的飞机设计
    const opponentDesignsContainer = document.createElement('div');
    opponentDesignsContainer.className = 'opponent-designs';
    opponentDesignsContainer.innerHTML = '<h3>对手飞机设计</h3>';
    
    console.log('准备绘制对手飞机设计，共有:', opponentDesignedAirplanes.length, '架');
    // 使用接收到的相对位置数据进行绘制
    opponentDesignedAirplanes.forEach((airplaneDesign, index) => {
        console.log('正在绘制第', index + 1, '架飞机的设计');
        console.log('这架飞机的设计部件:', airplaneDesign);

        const designBoard = document.createElement('div');
        designBoard.className = 'opponent-design-board';
        designBoard.innerHTML = `<h4>飞机 ${index + 1}</h4>`;
        
        // 创建 5x5 的设计棋盘
        const board = document.createElement('div');
        board.className = 'opponent-design-grid';
        
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const cell = document.createElement('div');
                cell.className = 'design-cell';
                
                // 检查是否是飞机设计的一部分 (使用相对位置进行判断)
                const isPartOfDesign = airplaneDesign.some(part =>
                    // part.x, part.y 已经是对应于设计中心 (0,0) 的坐标
                    // 在 5x5 棋盘上，设计中心 (0,0) 对应的绝对位置是 (2,4)
                    // 所以格子 (x,y) 对应的相对位置是 (x-2, y-4)
                    // 检查设计部件的相对位置是否与格子 (x,y) 对应的相对位置匹配
                    part.x === x - 2 && part.y === y - 4
                );
                
                if (isPartOfDesign) {
                    const isHead = airplaneDesign.some(part =>
                         part.x === x - 2 && part.y === y - 4 && part.isHead
                    );
                    cell.classList.add(isHead ? 'design-head' : 'design-body');
                    // 添加日誌，看看哪些格子被标记为飞机设计的一部分
                    console.log(`飞机 ${index + 1} 设计: 格子 (${x},${y}) 是飞机的一部分 (${isHead ? '头' : '身'})`);
                }
                
                board.appendChild(cell);
            }
        }
        
        designBoard.appendChild(board);
        opponentDesignsContainer.appendChild(designBoard);
    });
    
    // 移除旧的设计显示（如果存在）
    const oldDesigns = document.querySelector('.opponent-designs');
    if (oldDesigns) {
        oldDesigns.remove();
    }
    
    // 添加到游戏界面
    document.getElementById('game-screen').insertBefore(
        opponentDesignsContainer,
        document.getElementById('boards-container')
    );
    console.log('对手飞机设计绘制完成');
});

socket.on('attackResult', ({position, positions, result, nextTurn, isRadar}) => {
    if (isRadar) {
        // 处理雷达攻击结果
        positions.forEach(({x, y, result}) => {
            myVisibleBoard.set(`${x},${y}`, result);
        });
        lastOpponentAction = 'radar';
    } else {
        // 处理普通攻击结果
        myVisibleBoard.set(`${position.x},${position.y}`, result);
        lastOpponentAction = 'attack';
    }
    updateOpponentBoard();
    
    isMyTurn = socket.id === nextTurn;
    updateGameStatus();
});

socket.on('attacked', ({position, positions, result, isRadar}) => {
    if (isRadar) {
        // 处理雷达攻击结果
        positions.forEach(({x, y, result}) => {
            myAttackedCells.set(`${x},${y}`, result);
        });
    } else {
        // 处理普通攻击结果
        myAttackedCells.set(`${position.x},${position.y}`, result);
    }
    updateMyBoard();
});

socket.on('turnChanged', (nextTurn) => {
    isMyTurn = socket.id === nextTurn;
    updateGameStatus();
});

socket.on('playerDisconnected', (phase) => {
    const roomStatus = document.getElementById('room-status');
    if (roomStatus) {
        roomStatus.textContent = '对手已断开连接，等待新对手加入...';
    }
    gameStatus.textContent = '对手已断开连接';
    
    if (phase === 'battle') {
        // 如果是在战斗阶段断开，重置所有游戏数据
        placedAirplanes = 0;
        myBoard = [];
        myVisibleBoard.clear();
        myAttackedCells.clear();
        currentRotation = 0;
        radarUsed = false;
        moveModeActive = false;
        selectedPlaneForMove = null;
        movedPlanes.clear();
        originalPlanePosition = null;
        lastOpponentAction = null;
        
        // 清除所有视觉效果
        document.querySelectorAll('#my-board .cell, #opponent-board .cell').forEach(cell => {
            cell.className = 'cell';
        });
        
        // 移除游戏结束按钮
        const buttonContainer = document.querySelector('.game-over-buttons');
        if (buttonContainer) {
            buttonContainer.remove();
        }
        
        // 返回设计界面
        showScreen(designScreen);
        initializeDesignBoard();
        currentPlaneSpan.textContent = '1';
        designStatus.textContent = '';
        
        // 如果是原版，自动设置飞机设计
        if (gameVersion === 'original') {
            designedAirplanes = [originalAirplaneDesign, originalAirplaneDesign, originalAirplaneDesign];
            socket.emit('playerDesigned', currentRoom, designedAirplanes);
            showScreen(gameScreen);
            initializeBoard();
            placedAirplanes = 0;
            myBoard = [];
            document.querySelectorAll('#my-board .cell').forEach(cell => {
                cell.style.cursor = 'pointer';
            });
            const rotateButton = document.getElementById('rotate-button');
            if (rotateButton) {
                rotateButton.disabled = false;
                rotateButton.style.opacity = '1';
                rotateButton.style.cursor = 'pointer';
            }
            gameStatus.textContent = '请放置你的飞机（按R键旋转）';
            showRules('placement');
        }
    } else {
        // 如果是在设计或放置阶段断开，只更新状态显示
        if (roomStatus) {
            roomStatus.textContent = '对手已断开连接，等待新对手加入...';
        }
    }
});

socket.on('gameOver', (winnerId) => {
    handleGameOver(winnerId);
});

socket.on('error', (message) => {
    gameStatus.textContent = message;
});

// 辅助函数
function showScreen(screen) {
    [menuScreen, roomListScreen, gameScreen, designScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}

// 添加键盘事件监听器
document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r') {
        if (placedAirplanes < 3 || (moveModeActive && selectedPlaneForMove !== null)) {
            rotateAirplane();
        }
    }
});

// 添加鼠标移动事件监听器
document.querySelector('#my-board .board').addEventListener('mousemove', () => {
    if (placedAirplanes < 3) {
        updatePreview();
    } else if (moveModeActive && selectedPlaneForMove !== null && originalPlanePosition) {
        // 在移动模式下显示预览
        const hoveredCell = document.querySelector('#my-board .cell:hover');
        if (hoveredCell) {
            const x = parseInt(hoveredCell.dataset.x);
            const y = parseInt(hoveredCell.dataset.y);
            showAirplanePreview(x, y, originalPlanePosition);
        }
    }
});

// 切换移动飞机模式
function toggleMoveMode() {
    if (!isMyTurn) return;
    
    moveModeActive = !moveModeActive;
    const moveButton = document.getElementById('move-button');
    
    if (moveModeActive) {
        // 取消雷达模式
        const radarButton = document.getElementById('radar-button');
        if (radarButton.classList.contains('active')) {
            radarButton.classList.remove('active');
            document.querySelectorAll('#opponent-board .cell').forEach(cell => {
                cell.classList.remove('radar-mode');
            });
        }
        
        // 高亮可移动的飞机
        highlightMovablePlanes();
    } else {
        // 取消高亮
        document.querySelectorAll('#my-board .cell').forEach(cell => {
            cell.classList.remove('movable');
        });
        
        // 如果已经选中飞机但未完成移动，恢复原位置
        if (selectedPlaneForMove !== null) {
            restorePlanePosition();
        }
        
        // 清除所有预览效果
        document.querySelectorAll('#my-board .cell.preview').forEach(cell => {
            cell.classList.remove('preview', 'preview-head', 'preview-body');
        });
    }
}

// 高亮可移动的飞机
function highlightMovablePlanes() {
    document.querySelectorAll('#my-board .cell').forEach(cell => {
        cell.classList.remove('movable');
    });
    
    myBoard.forEach((airplane, index) => {
        if (movedPlanes.has(index)) return; // 已经移动过的飞机不能移动
        
        // 检查机头是否被攻击过
        const head = airplane.find(part => part.isHead);
        const headCell = document.querySelector(`#my-board .cell[data-x="${head.x}"][data-y="${head.y}"]`);
        if (headCell.classList.contains('attacked-head') || headCell.classList.contains('attacked-body')) return;
        
        // 高亮这架飞机的所有部件
        airplane.forEach(part => {
            const cell = document.querySelector(`#my-board .cell[data-x="${part.x}"][data-y="${part.y}"]`);
            cell.classList.add('movable');
        });
    });
}

// 处理移动模式下的点击
function handleMoveModeClick(x, y) {
    if (!moveModeActive) return;
    
    if (selectedPlaneForMove === null) {
        // 选择要移动的飞机
        const clickedPlaneIndex = myBoard.findIndex(airplane => 
            airplane.some(part => part.x === x && part.y === y)
        );
        
        if (clickedPlaneIndex !== -1 && !movedPlanes.has(clickedPlaneIndex)) {
            // 检查机头是否被攻击过
            const head = myBoard[clickedPlaneIndex].find(part => part.isHead);
            const headCell = document.querySelector(`#my-board .cell[data-x="${head.x}"][data-y="${head.y}"]`);
            if (headCell.classList.contains('attacked-head') || headCell.classList.contains('attacked-body')) return;
            
            selectedPlaneForMove = clickedPlaneIndex;
            originalPlanePosition = [...myBoard[clickedPlaneIndex]];
            
            // 移除选中的飞机
            removePlaneFromBoard(clickedPlaneIndex);
            
            // 启用旋转按钮
            const rotateButton = document.getElementById('rotate-button');
            rotateButton.disabled = false;
            rotateButton.style.opacity = '1';
            rotateButton.style.cursor = 'pointer';
            
            // 更新游戏状态
            gameStatus.textContent = '请放置移动的飞机（按R键旋转）';
        }
    } else {
        // 放置移动的飞机
        const currentShape = originalPlanePosition;
        const rotatedShape = rotateShape(currentShape, currentRotation);
        
        // 找到机头的位置
        const headPart = rotatedShape.find(part => part.isHead);
        if (!headPart) return;
        
        // 计算偏移量，使鼠标位置对应机头
        const offsetX = x - headPart.x;
        const offsetY = y - headPart.y;
        
        if (canPlaceAirplane(offsetX, offsetY, rotatedShape)) {
            // 放置飞机
            const newPlane = rotatedShape.map(part => ({
                x: offsetX + part.x,
                y: offsetY + part.y,
                isHead: part.isHead
            }));
            
            myBoard[selectedPlaneForMove] = newPlane;
            movedPlanes.add(selectedPlaneForMove);
            
            // 更新视觉效果
            newPlane.forEach(part => {
                const cell = document.querySelector(`#my-board .cell[data-x="${part.x}"][data-y="${part.y}"]`);
                cell.classList.add(part.isHead ? 'head' : 'body');
            });
            
            // 清除所有高亮和预览效果
            document.querySelectorAll('#my-board .cell').forEach(cell => {
                cell.classList.remove('movable', 'preview', 'preview-head', 'preview-body');
            });
            
            // 重置移动状态
            selectedPlaneForMove = null;
            originalPlanePosition = null;
            moveModeActive = false;
            
            // 禁用旋转按钮
            const rotateButton = document.getElementById('rotate-button');
            rotateButton.disabled = true;
            rotateButton.style.opacity = '0.5';
            rotateButton.style.cursor = 'not-allowed';
            
            // 发送移动结果到服务器
            socket.emit('planeMoved', currentRoom, myBoard);
            
            // 结束回合
            endTurn();
        }
    }
}

// 移除飞机
function removePlaneFromBoard(planeIndex) {
    const airplane = myBoard[planeIndex];
    airplane.forEach(part => {
        const cell = document.querySelector(`#my-board .cell[data-x="${part.x}"][data-y="${part.y}"]`);
        cell.classList.remove('head', 'body', 'movable');
    });
}

// 恢复飞机位置
function restorePlanePosition() {
    if (selectedPlaneForMove === null || originalPlanePosition === null) return;
    
    myBoard[selectedPlaneForMove] = [...originalPlanePosition];
    
    // 更新视觉效果
    originalPlanePosition.forEach(part => {
        const cell = document.querySelector(`#my-board .cell[data-x="${part.x}"][data-y="${part.y}"]`);
        cell.classList.add(part.isHead ? 'head' : 'body');
    });
    
    selectedPlaneForMove = null;
    originalPlanePosition = null;
}

// 结束回合
function endTurn() {
    isMyTurn = false;
    updateGameStatus();
    
    // 禁用所有按钮
    const moveButton = document.getElementById('move-button');
    const radarButton = document.getElementById('radar-button');
    moveButton.disabled = true;
    moveButton.style.opacity = '0.5';
    moveButton.style.cursor = 'not-allowed';
    radarButton.disabled = true;
    radarButton.style.opacity = '0.5';
    radarButton.style.cursor = 'not-allowed';
}

// 处理对手移动飞机
socket.on('opponentMoved', (newBoardState) => {
    // 更新对手的飞机位置
    opponentBoard = newBoardState;
    lastOpponentAction = 'move';
    
    // 重新计算所有攻击结果
    const newVisibleBoard = new Map();
    myVisibleBoard.forEach((result, key) => {
        const [x, y] = key.split(',').map(Number);
        const newResult = checkAttackResult(opponentBoard, {x, y});
        newVisibleBoard.set(key, newResult);
    });
    
    // 更新可见棋盘
    myVisibleBoard = newVisibleBoard;
    
    // 更新对手棋盘的显示
    updateOpponentBoard();
    
    // 更新游戏状态
    updateGameStatus();
    
    // 显示提示
    alert('对手移动了飞机！');
});

// 检查攻击结果（客户端版本）
function checkAttackResult(airplanes, position) {
    for (const airplane of airplanes) {
        for (const part of airplane) {
            if (part.x === position.x && part.y === position.y) {
                return part.isHead ? 'head' : 'body';
            }
        }
    }
    return 'empty';
}

// 修改完成设计函数
function completeDesign() {
    const result = checkAirplaneDesign();
    if (result.valid) {
        saveDesignedAirplane();
        currentDesignPlane++;
        
        if (currentDesignPlane < 3) {
            currentPlaneSpan.textContent = currentDesignPlane + 1;
            resetDesign();
            designStatus.textContent = '';
        } else {
            // 所有飞机设计完成，向服务器发送设计好的飞机（相对位置）
            socket.emit('playerDesigned', currentRoom, designedAirplanes);

            // 进入放置飞机环节
            showScreen(gameScreen);
            initializeBoard();
            // 设置初始状态
            placedAirplanes = 0;
            myBoard = []; // 这个 myBoard 将用于存储放置在 10x10 棋盘上的绝对位置
            // 启用放置功能
            document.querySelectorAll('#my-board .cell').forEach(cell => {
                cell.style.cursor = 'pointer';
            });
            // 启用旋转按钮
            const rotateButton = document.getElementById('rotate-button');
            if (rotateButton) {
                rotateButton.disabled = false;
                rotateButton.style.opacity = '1';
                rotateButton.style.cursor = 'pointer';
            }
            // 更新游戏状态
            gameStatus.textContent = '请放置你的飞机（按R键旋转）';
            // 显示放置阶段规则
            showRules('placement');
        }
    } else {
        designStatus.textContent = result.message;
    }
} 