const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const os = require('os');

app.use(express.static('public'));

// 添加获取 IP 地址的路由
app.get('/api/ip', (req, res) => {
    // 获取所有网络接口
    const networkInterfaces = os.networkInterfaces();
    let ipAddress = '';

    // 遍历所有网络接口
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((interface) => {
            // 只获取 IPv4 地址，且排除本地回环地址
            if (interface.family === 'IPv4' && !interface.internal) {
                ipAddress = interface.address;
            }
        });
    });

    // 如果没有找到合适的 IP 地址，则使用请求中的 IP
    if (!ipAddress) {
        ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    }

    res.json({ ip: ipAddress });
});

// 存储游戏房间信息
const rooms = new Map();

class Room {
    constructor(version) {
        this.players = new Map();
        this.airplanes = new Map();
        this.designedAirplanes = new Map();
        this.boards = new Map();
        this.currentTurn = null;
        this.radarUsed = new Map();
        this.version = version;
    }
}

// 飞机形状定义 (客户端使用，服务器端现在主要处理完整的飞机位置)
const airplaneShape = [
    {x: 0, y: 0},    // 机头
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

io.on('connection', (socket) => {
    console.log('用户已连接');

    // 创建房间
    socket.on('createRoom', (version, callback) => {
        const roomId = Math.random().toString(36).substring(2, 8);
        const room = new Room(version);
        room.players.set(socket.id, true);
        rooms.set(roomId, room);
        socket.join(roomId);
        callback(roomId);
        console.log(`房间 ${roomId} 已创建，版本: ${version}，房主 ${socket.id} 已加入`);
    });

    // 获取可用房间列表
    socket.on('getRooms', (callback) => {
        const availableRooms = Array.from(rooms.entries())
            .filter(([_, room]) => room.players.size < 2)
            .map(([id, room]) => ({
                id,
                players: room.players.size,
                version: room.version
            }));
        callback(availableRooms);
    });

    // 加入房间
    socket.on('joinRoom', (roomId, callback) => {
        const room = rooms.get(roomId);
        if (room && room.players.size < 2) {
            room.players.set(socket.id, true);
            socket.join(roomId);
            io.to(roomId).emit('playerJoined');
            callback(true);
            console.log(`用户 ${socket.id} 加入房间 ${roomId}，当前房间玩家数：${room.players.size}`);
        } else {
            callback(false);
            console.log(`用户 ${socket.id} 加入房间 ${roomId} 失败`);
        }
    });

    // 客户端完成飞机设计时发送设计数据（新增事件）
    socket.on('playerDesigned', (roomId, designedAirplanes) => {
        const room = rooms.get(roomId);
        if (room) {
            room.designedAirplanes.set(socket.id, designedAirplanes);
             console.log(`玩家 ${socket.id} 在房间 ${roomId} 完成飞机设计`);
        }
    });

    // 设置飞机位置 (客户端发送的是在 10x10 棋盘上的绝对位置)
    socket.on('setAirplanes', (roomId, placedAirplanes) => { // 变量名更清晰
        const room = rooms.get(roomId);
        if (room) {
            room.airplanes.set(socket.id, placedAirplanes); // 存储玩家放置好的飞机绝对位置

            // 在服务器端创建并存储玩家的棋盘状态（包括可见棋盘和击中计数）
            room.boards.set(socket.id, {
                fullAirplanes: placedAirplanes, // 存储完整的飞机位置，用于命中判断
                visibleBoard: new Map(), // 用于记录对手棋盘的攻击结果
                headHits: 0 // 机头击中计数
            });

            // 当双方都设置好飞机后，开始游戏
            if (room.airplanes.size === 2) {
                const players = Array.from(room.players.keys());
                const firstTurn = players[Math.floor(Math.random() * 2)];

                // 在服务器端设置当前回合
                room.currentTurn = firstTurn;
                 console.log(`房间 ${roomId} 游戏开始，先手玩家: ${firstTurn}`);

                // 向双方发送游戏开始信号和对手的飞机设计（相对位置）
                players.forEach(playerId => {
                    const opponentId = players.find(id => id !== playerId);
                    // 从 designedAirplanes 中获取对手的原始设计（相对位置）
                    const opponentDesignedAirplanes = room.designedAirplanes.get(opponentId);
                    io.to(playerId).emit('gameStart', firstTurn, opponentDesignedAirplanes); // 发送相对设计
                     console.log(`向玩家 ${playerId} 发送游戏开始信号和对手飞机设计`);
                });
            }
        }
    });

    // 发起攻击
    socket.on('attack', (roomId, position, isRadar = false) => {
        console.log('收到攻击请求:', {roomId, position, playerId: socket.id, isRadar});
        const room = rooms.get(roomId);
        if (room && room.currentTurn === socket.id) {
            console.log('是当前回合玩家');
            const players = Array.from(room.players.keys());
            const opponentId = players.find(id => id !== socket.id);

            if (!opponentId) {
                console.error('找不到对手ID');
                return;
            }

            // 检查雷达使用限制
            if (isRadar) {
                if (room.radarUsed.get(socket.id)) {
                    console.error('已经使用过雷达');
                    socket.emit('error', '你已经使用过雷达了');
                    return;
                }
                room.radarUsed.set(socket.id, true);
            }

            const opponentBoardState = room.boards.get(opponentId);
            if (!opponentBoardState || !opponentBoardState.fullAirplanes) {
                console.error('找不到对手完整的飞机位置数据');
                return;
            }
            const opponentFullAirplanes = opponentBoardState.fullAirplanes;
            console.log('找到对手完整的飞机位置数据');

            // 处理雷达攻击
            if (isRadar) {
                const results = [];
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const newX = position.x + dx;
                        const newY = position.y + dy;
                        if (newX >= 0 && newX < 10 && newY >= 0 && newY < 10) {
                            const result = checkAttack(opponentFullAirplanes, {x: newX, y: newY});
                            results.push({x: newX, y: newY, result});
                        }
                    }
                }
                
                // 更新攻击者的可见棋盘状态
                const attackerBoardState = room.boards.get(socket.id);
                if (attackerBoardState && attackerBoardState.visibleBoard) {
                    results.forEach(({x, y, result}) => {
                        attackerBoardState.visibleBoard.set(`${x},${y}`, result);
                        if (result === 'head') {
                            const currentHits = attackerBoardState.headHits || 0;
                            attackerBoardState.headHits = currentHits + 1;
                        }
                    });

                    // 检查游戏是否结束
                    if (attackerBoardState.headHits >= 3) {
                        io.to(roomId).emit('gameOver', socket.id);
                        console.log(`房间 ${roomId} 游戏结束，玩家 ${socket.id} 获胜`);
                    } else {
                        // 游戏未结束，切换回合
                        room.currentTurn = opponentId;
                        console.log(`房间 ${roomId} 回合切换到: ${opponentId}`);

                        // 向攻击者发送攻击结果和下回合玩家信息
                        socket.emit('attackResult', {
                            positions: results,
                            nextTurn: room.currentTurn,
                            isRadar: true
                        });

                        // 向被攻击者发送被攻击通知
                        socket.to(opponentId).emit('attacked', {
                            positions: results,
                            isRadar: true
                        });

                        // 向双方发送回合切换通知
                        io.to(roomId).emit('turnChanged', room.currentTurn);
                    }
                }
            } else {
                // 原有的单点攻击逻辑
                const result = checkAttack(opponentFullAirplanes, position);
                console.log('攻击结果:', result);

                const attackerBoardState = room.boards.get(socket.id);
                if (attackerBoardState && attackerBoardState.visibleBoard) {
                    attackerBoardState.visibleBoard.set(`${position.x},${position.y}`, result);

                    if (result === 'head') {
                        const currentHits = attackerBoardState.headHits || 0;
                        attackerBoardState.headHits = currentHits + 1;
                        console.log(`玩家 ${socket.id} 击中机头，总计 ${attackerBoardState.headHits} 次`);
                    }

                    if (result === 'head' && attackerBoardState.headHits >= 3) {
                        io.to(roomId).emit('gameOver', socket.id);
                        console.log(`房间 ${roomId} 游戏结束，玩家 ${socket.id} 获胜`);
                    } else {
                        room.currentTurn = opponentId;
                        console.log(`房间 ${roomId} 回合切换到: ${opponentId}`);

                        socket.emit('attackResult', {
                            position,
                            result,
                            nextTurn: room.currentTurn,
                            isRadar: false
                        });

                        socket.to(opponentId).emit('attacked', {
                            position,
                            result,
                            isRadar: false
                        });

                        io.to(roomId).emit('turnChanged', room.currentTurn);
                    }
                }
            }
        } else {
            console.log('不是当前回合玩家或房间不存在');
        }
    });

    // 处理飞机移动
    socket.on('planeMoved', (roomId, newBoardState) => {
        console.log('收到飞机移动请求:', {roomId, playerId: socket.id});
        const room = rooms.get(roomId);
        if (room && room.currentTurn === socket.id) {
            // 更新玩家的飞机位置
            room.airplanes.set(socket.id, newBoardState);
            
            // 更新棋盘状态
            const boardState = room.boards.get(socket.id);
            boardState.fullAirplanes = newBoardState;
            
            // 获取对手ID
            const players = Array.from(room.players.keys());
            const opponentId = players.find(id => id !== socket.id);
            
            // 重新计算所有攻击结果
            const opponentBoardState = room.boards.get(opponentId);
            if (opponentBoardState && opponentBoardState.visibleBoard) {
                const newVisibleBoard = new Map();
                
                // 遍历所有已攻击的位置，重新计算结果
                opponentBoardState.visibleBoard.forEach((result, key) => {
                    const [x, y] = key.split(',').map(Number);
                    const newResult = checkAttack(newBoardState, {x, y});
                    newVisibleBoard.set(key, newResult);
                });
                
                // 更新可见棋盘
                opponentBoardState.visibleBoard = newVisibleBoard;
                
                // 重新计算机头击中数
                opponentBoardState.headHits = Array.from(newVisibleBoard.values())
                    .filter(result => result === 'head').length;
            }
            
            // 切换回合
            room.currentTurn = opponentId;
            
            // 通知双方更新
            io.to(roomId).emit('turnChanged', opponentId);
            io.to(opponentId).emit('opponentMoved', newBoardState);
        }
    });

    // 处理获取对手棋盘的请求 (游戏结束时使用，返回完整的对手飞机位置)
    socket.on('getOpponentBoard', (roomId, callback) => {
        const room = rooms.get(roomId);
        if (room) {
            const players = Array.from(room.players.keys());
            const opponentId = players.find(id => id !== socket.id);
            if (opponentId) {
                const opponentBoardState = room.boards.get(opponentId);
                if (opponentBoardState && opponentBoardState.fullAirplanes) {
                     console.log(`玩家 ${socket.id} 请求获取对手完整的棋盘位置`);
                    callback(opponentBoardState.fullAirplanes); // 返回完整的飞机位置
                } else {
                    console.error('getOpponentBoard: 找不到对手完整的棋盘位置');
                    callback(null);
                }
            } else {
                console.error('getOpponentBoard: 找不到对手ID');
                callback(null);
            }
        } else {
            console.error('getOpponentBoard: 找不到房间');
            callback(null);
        }
    });

    // 断开连接处理
    socket.on('disconnect', () => {
        console.log('用户已断开连接');
        rooms.forEach((room, roomId) => {
            if (room.players.has(socket.id)) {
                 console.log(`用户 ${socket.id} 从房间 ${roomId} 断开连接`);
                room.players.delete(socket.id);
                io.to(roomId).emit('playerDisconnected');
                // 如果房间里沒有人了，删除房间
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                     console.log(`房间 ${roomId} 已清空并删除`);
                }
            }
        });
    });
});

// 检查攻击结果 (这个函数需要根据完整的飞机位置来判断)
function checkAttack(opponentFullAirplanes, position) {
     if (!opponentFullAirplanes) {
        console.error("checkAttack: 没有找到对手完整的飞机位置数据");
        return 'empty'; // 或者抛出错误
    }
    for (const airplane of opponentFullAirplanes) { // airplane 是一个单架飞机的部件列表，包含 x, y (绝对位置) 和 isHead
        for (const part of airplane) {
            if (part.x === position.x && part.y === position.y) {
                return part.isHead ? 'head' : 'body';
            }
        }
    }
    return 'empty';
}

// 新增函数：根据飞机设计生成完整的棋盘位置 (这个函数似乎是多余的，客户端已经提供了完整的绝对位置)
// 保留这个函数名，但其實直接使用傳入的 airplanes 數據即可
function generateFullBoard(designedAirplanes) {
    // designedAirplanes 實際上是客戶端放置飛機後發送的絕對位置列表
    return designedAirplanes;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
}); 