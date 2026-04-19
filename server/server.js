const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port", PORT);

const clients = new Map(); // ws → user
const userSockets = new Map(); // userId → ws

// ===== HISTORY STORAGE (RAM Buffer) =====
const MAX_HISTORY = 100;
const groupHistories = new Map(); // groupId -> array of messages
// key: "userIdA_userIdB" (sorted alphabetically), value: array of messages
const privateHistory = new Map();

function storeGroupMessage(groupId, msg) {
    if (!groupHistories.has(groupId)) {
        groupHistories.set(groupId, []);
    }
    const history = groupHistories.get(groupId);
    if (history.length >= MAX_HISTORY) history.shift();
    history.push(msg);
}

function storePrivateMessage(userIdA, userIdB, msg) {
    const threadId = [userIdA, userIdB].sort().join("_");
    if (!privateHistory.has(threadId)) {
        privateHistory.set(threadId, []);
    }
    const history = privateHistory.get(threadId);
    if (history.length >= MAX_HISTORY) history.shift();

    // Update message status in history if it's a status update
    if (msg.type === "status_update") {
        const targetMsg = history.find(m => m.msgId === msg.msgId);
        if (targetMsg) {
            targetMsg.status = msg.status;
        }
    } else {
        history.push(msg);
    }
}

function getPrivateHistory(userId) {
    const userHistory = {};
    for (const [threadId, msgs] of privateHistory.entries()) {
        if (threadId.includes(userId)) {
            const otherUser = threadId.replace(userId, "").replace("_", "");
            userHistory[otherUser] = msgs;
        }
    }
    return userHistory;
}

// ===== LOAD USERS DB =====
const USERS_FILE = path.join(__dirname, "users.json");
let usersDb = {};
if (fs.existsSync(USERS_FILE)) {
    try {
        usersDb = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    } catch (e) {
        console.error("Error reading users.json", e);
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDb, null, 2));
}

// ===== LOAD GROUPS DB =====
const GROUPS_FILE = path.join(__dirname, "groups.json");
let groupsDb = {};
if (fs.existsSync(GROUPS_FILE)) {
    try {
        groupsDb = JSON.parse(fs.readFileSync(GROUPS_FILE, "utf-8"));
    } catch (e) {
        console.error("Error reading groups.json", e);
    }
}

function saveGroups() {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupsDb, null, 2));
}

// Ensure legacy groups have creatorId
for (const [gid, grp] of Object.entries(groupsDb)) {
    if (!grp.creatorId && grp.members.length > 0) {
        grp.creatorId = grp.members[0];
    }
}

function getUserGroups(userId) {
    const userGroups = {};
    for (const [groupId, group] of Object.entries(groupsDb)) {
        if (group.members.includes(userId)) {
            userGroups[groupId] = group;
        }
    }
    return userGroups;
}

function getUserGroupHistories(userId) {
    const histories = {};
    for (const [groupId, group] of Object.entries(groupsDb)) {
        if (group.members.includes(userId)) {
            histories[groupId] = groupHistories.get(groupId) || [];
        }
    }
    return histories;
}


wss.on("connection", (ws) => {

    ws.on("message", async (data) => {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch (err) {
            console.log("Invalid JSON:", data);
            return;
        }

        // ===== REGISTER =====
        if (message.type === "register") {
            const { username, password, userId } = message;

            if (!username || !password || username.trim() === "" || password.length < 6) {
                return ws.send(JSON.stringify({ type: "auth_error", error: "Username required, password must be at least 6 characters." }));
            }

            const lowerUsername = username.toLowerCase();
            if (usersDb[lowerUsername]) {
                return ws.send(JSON.stringify({ type: "auth_error", error: "Username is already taken." }));
            }

            try {
                const hash = await bcrypt.hash(password, 10);
                usersDb[lowerUsername] = {
                    username: username,
                    passwordHash: hash,
                    userId: userId || Math.random().toString(36).substring(2, 12)
                };
                saveUsers();

                const user = { username: usersDb[lowerUsername].username, userId: usersDb[lowerUsername].userId };
                loginSuccess(ws, user);
            } catch (err) {
                console.error("Register err:", err);
                ws.send(JSON.stringify({ type: "auth_error", error: "Internal server error" }));
            }
        }

        // ===== LOGIN =====
        if (message.type === "login") {
            const { username, password } = message;
            if (!username || !password) return ws.send(JSON.stringify({ type: "auth_error", error: "Missing credentials" }));

            const lowerUsername = username.toLowerCase();
            const dbUser = usersDb[lowerUsername];

            if (!dbUser) return ws.send(JSON.stringify({ type: "auth_error", error: "Invalid username or password" }));

            try {
                const match = await bcrypt.compare(password, dbUser.passwordHash);
                if (!match) return ws.send(JSON.stringify({ type: "auth_error", error: "Invalid username or password" }));

                const user = { username: dbUser.username, userId: dbUser.userId };
                loginSuccess(ws, user);
            } catch (err) {
                console.error("Login err:", err);
                ws.send(JSON.stringify({ type: "auth_error", error: "Internal server error" }));
            }
        }

        // ===== SESSION RECONNECT (Tokenless auto-login) =====
        if (message.type === "reconnect") {
            const { userId } = message;
            let dbUserForReconnect = null;
            for (const u of Object.values(usersDb)) {
                if (u.userId === userId) {
                    dbUserForReconnect = u;
                    break;
                }
            }
            if (dbUserForReconnect) {
                loginSuccess(ws, { username: dbUserForReconnect.username, userId: dbUserForReconnect.userId });
            } else {
                ws.send(JSON.stringify({ type: "auth_error", error: "Session invalid." }));
            }
        }

        const currentUser = clients.get(ws);

        if (message.type === "join") {
            ws.send(JSON.stringify({ type: "auth_error", error: "Must use login or register" }));
        }

        // ===== GROUP CHAT ACTIONS =====
        if (message.type === "create_group" && currentUser) {
            const { groupId, name } = message;
            groupsDb[groupId] = {
                groupId,
                name: name || "New Group",
                creatorId: currentUser.userId,
                members: [currentUser.userId]
            };
            saveGroups();

            // Notify creator
            ws.send(JSON.stringify({
                type: "group_update",
                group: groupsDb[groupId]
            }));
        }

        if (message.type === "add_member" && currentUser) {
            const { groupId, userId } = message;
            if (groupsDb[groupId] && groupsDb[groupId].members.includes(currentUser.userId)) {
                if (!groupsDb[groupId].members.includes(userId)) {
                    groupsDb[groupId].members.push(userId);
                    saveGroups();

                    groupsDb[groupId].members.forEach(mId => {
                        const mSocket = userSockets.get(mId);
                        if (mSocket && mSocket.readyState === WebSocket.OPEN) {
                            mSocket.send(JSON.stringify({
                                type: "group_update",
                                group: groupsDb[groupId]
                            }));
                        }
                    });
                }
            }
        }

        if (message.type === "remove_member" && currentUser) {
            const { groupId, userId } = message;
            if (groupsDb[groupId] && groupsDb[groupId].creatorId === currentUser.userId) {
                const idx = groupsDb[groupId].members.indexOf(userId);
                if (idx > -1 && userId !== currentUser.userId) {
                    groupsDb[groupId].members.splice(idx, 1);
                    saveGroups();

                    const notifyList = [...groupsDb[groupId].members, userId];
                    notifyList.forEach(mId => {
                        const mSocket = userSockets.get(mId);
                        if (mSocket && mSocket.readyState === WebSocket.OPEN) {
                            if (mId === userId) {
                                mSocket.send(JSON.stringify({ type: "group_deleted", groupId: groupId }));
                            } else {
                                mSocket.send(JSON.stringify({ type: "group_update", group: groupsDb[groupId] }));
                            }
                        }
                    });
                }
            }
        }

        if (message.type === "delete_group" && currentUser) {
            const { groupId } = message;
            if (groupsDb[groupId] && groupsDb[groupId].creatorId === currentUser.userId) {
                const members = [...groupsDb[groupId].members];
                delete groupsDb[groupId];
                groupHistories.delete(groupId);
                saveGroups();

                members.forEach(mId => {
                    const mSocket = userSockets.get(mId);
                    if (mSocket && mSocket.readyState === WebSocket.OPEN) {
                        mSocket.send(JSON.stringify({ type: "group_deleted", groupId: groupId }));
                    }
                });
            }
        }

        if (message.type === "group_chat" && currentUser) {
            const { groupId, text, msgId } = message;
            if (groupsDb[groupId] && groupsDb[groupId].members.includes(currentUser.userId)) {
                const chatMsg = {
                    type: "group_chat",
                    msgId: msgId,
                    groupId: groupId,
                    username: currentUser.username,
                    userId: currentUser.userId,
                    text: text,
                    timestamp: Date.now()
                };
                storeGroupMessage(groupId, chatMsg);

                // Broadcast to members only
                const data = JSON.stringify(chatMsg);
                groupsDb[groupId].members.forEach(mId => {
                    const mSocket = userSockets.get(mId);
                    if (mSocket && mSocket.readyState === WebSocket.OPEN) {
                        mSocket.send(data);
                    }
                });
            }
        }

        // ===== PRIVATE CHAT =====
        if (message.type === "private" && currentUser) {
            const receiverSocket = userSockets.get(message.to);
            const privateMessage = {
                type: "private",
                msgId: message.msgId,
                from: currentUser.userId,
                to: message.to,
                username: currentUser.username,
                text: message.text,
                status: "sent",
                timestamp: Date.now()
            };

            storePrivateMessage(currentUser.userId, message.to, privateMessage);

            if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
                receiverSocket.send(JSON.stringify(privateMessage));

                // Immediately mark delivered for the receiver, and tell sender
                privateMessage.status = "delivered";
                storePrivateMessage(currentUser.userId, message.to, { type: "status_update", msgId: message.msgId, status: "delivered" });
                ws.send(JSON.stringify({ type: "status", msgId: message.msgId, status: "delivered", from: message.to }));
            }
            ws.send(JSON.stringify(privateMessage));
        }

        // ===== MESSAGE STATUS UPDATE (Seen) =====
        if (message.type === "status" && currentUser) {
            const receiverSocket = userSockets.get(message.to);

            // update history
            storePrivateMessage(currentUser.userId, message.to, { type: "status_update", msgId: message.msgId, status: message.status });

            if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
                receiverSocket.send(JSON.stringify({
                    type: "status",
                    msgId: message.msgId, // specific message acknowledged
                    status: message.status,
                    from: currentUser.userId
                }));
            }
        }

        // ===== TYPING INDICATOR =====
        if (message.type === "typing" && currentUser) {
            const payload = {
                type: "typing",
                from: currentUser.userId,
                username: currentUser.username,
                isTyping: message.isTyping,
                channelMode: message.channelMode // "group" or specific toId
            };
            if (message.channelMode === "group") {
                broadcast(payload, ws); // broadcast to all except sender
            } else {
                const receiverSocket = userSockets.get(message.to);
                if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
                    receiverSocket.send(JSON.stringify(payload));
                }
            }
        }
    });

    ws.on("close", () => {
        const user = clients.get(ws);
        if (user) {
            broadcast({ type: "notification", text: `${user.username} left the chat` });
            userSockets.delete(user.userId);
        }
        clients.delete(ws);
        sendUserList();
    });
});

function loginSuccess(ws, user) {
    const existingSocket = userSockets.get(user.userId);
    if (existingSocket && existingSocket !== ws && existingSocket.readyState === WebSocket.OPEN) {
        existingSocket.send(JSON.stringify({ type: "auth_error", error: "Logged in from another location." }));
        existingSocket.close();
    }

    clients.set(ws, user);
    userSockets.set(user.userId, ws);

    // Provide history dump
    ws.send(JSON.stringify({
        type: "auth_success",
        user,
        userId: user.userId,
        groups: getUserGroups(user.userId),
        history: {
            group: getUserGroupHistories(user.userId),
            private: getPrivateHistory(user.userId)
        }
    }));

    console.log("LOGIN:", user);
    broadcast({ type: "notification", text: `${user.username} joined the chat` });
    sendUserList();
}

function sendUserList() {
    const users = [];
    for (let [ws, user] of clients.entries()) {
        if (user && user.username && user.userId && ws.readyState === WebSocket.OPEN) {
            users.push({ username: user.username, userId: user.userId });
        }
    }
    broadcast({ type: "users", users });
}

function broadcast(message, excludeWs = null) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

console.log("✅ Server running on ws://localhost:8080");