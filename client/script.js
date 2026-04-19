let socketMode = "login"; // login | signup
let socket;
let reconnectTimeout = null;

function connectWS() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    socket = new WebSocket("wss://nexora-ai-b915.onrender.com");

    socket.onopen = () => {
        console.log("Connected to server.");
        // Always attempt auto-reconnect when we have a stored userId
        // This covers both page refreshes and network reconnects
        if (currentUserId) {
            socket.send(JSON.stringify({ type: "reconnect", userId: currentUserId }));
        }
    };

    socket.onclose = () => {
        console.log("Disconnected. Reconnecting in 3s...");
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                connectWS();
            }, 3000);
        }
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        // AUTH
        if (message.type === "auth_error") {
            if (chatScreen.style.display !== "none") {
                showNotification("Session Notification", message.error);
            } else {
                showAuthError(message.error);
            }
        }
        if (message.type === "auth_success") {
            handleAuthSuccess(message.user, message.userId, message.history, message.groups);
        }

        // USERS VISIBILITY OVERRIDE
        if (message.type === "users") {
            // Only update presence of users we ALREADY have threads with
            const activeThreadsIds = Object.keys(chats.private) || [];

            // clear DOM initially
            usersDiv.innerHTML = "";
            let renderedCount = 0;

            activeThreadsIds.forEach(targetId => {
                // Find them in the server's online broadcast
                const isOnline = message.users.find(u => u.userId === targetId);

                // Fallback to locally tracked identity
                let displayUsername = "User-" + targetId.substring(0, 4);
                if (isOnline) {
                    displayUsername = isOnline.username;
                } else if (chats.private[targetId]?.length > 0) {
                    // Try to glean username from existing history
                    const msg = chats.private[targetId].find(m => m.username);
                    if (msg) displayUsername = msg.username;
                }

                const div = document.createElement("div");
                div.className = "user" + (selectedUser?.userId === targetId ? " active" : "");
                div.dataset.uid = targetId;

                div.appendChild(makeInitialsAvatar(displayUsername));

                const nameSpan = document.createElement("span");
                nameSpan.className = "user-name";
                nameSpan.textContent = displayUsername + (isOnline ? "" : " (Offline)");

                const typingSpan = document.createElement("span");
                typingSpan.className = "typing-badge";
                typingSpan.innerHTML = "💬";
                typingSpan.style.display = "none";
                typingSpan.id = `typing_${targetId}`;

                div.appendChild(nameSpan);
                div.appendChild(typingSpan);
                div.onclick = () => selectUser({ userId: targetId, username: displayUsername });
                usersDiv.appendChild(div);

                renderedCount++;
            });

            // If we are actively selected on someone who has NO message history yet
            if (selectedUser && !activeThreadsIds.includes(selectedUser.userId)) {
                const isOnline = message.users.find(u => u.userId === selectedUser.userId);
                const div = document.createElement("div");
                div.className = "user active";
                div.dataset.uid = selectedUser.userId;

                div.appendChild(makeInitialsAvatar(selectedUser.username));

                const nameSpan = document.createElement("span");
                nameSpan.className = "user-name";
                nameSpan.textContent = selectedUser.username + (isOnline ? "" : " (Offline)");

                div.appendChild(nameSpan);
                div.onclick = () => selectUser(selectedUser);
                usersDiv.appendChild(div);

                renderedCount++;
            }

            onlineCountDiv.textContent = renderedCount;
        }

        // STATUS UPDATE (per-message)
        if (message.type === "status") {
            if (mode === "private" && selectedUser?.userId === message.from) {
                const targetMsg = chats.private[message.from]?.find(m => m.msgId === message.msgId);
                if (targetMsg) targetMsg.status = message.status;
                updateMessageStatusUI(message.msgId, message.status);
            }
        }

        // TYPING INDICATOR
        if (message.type === "typing") {
            if (message.channelMode === "group" && mode === "group") {
                showHeaderTyping(message.username, message.isTyping);
            } else if (message.channelMode !== "group") {
                const typBadge = document.getElementById(`typing_${message.from}`);
                if (typBadge) typBadge.style.display = message.isTyping ? "inline-block" : "none";

                if (mode === "private" && selectedUser?.userId === message.from) {
                    showHeaderTyping(message.username, message.isTyping);
                }
            }
        }

        if (message.type === "group_update") {
            customGroups[message.group.groupId] = message.group;
            renderGroupsList();

            // Auto-select the group if we just created it
            if (pendingNewGroupId && pendingNewGroupId === message.group.groupId) {
                pendingNewGroupId = null;
                selectGroup(message.group.groupId);
            } else if (mode === "group" && selectedGroupId === message.group.groupId) {
                modeIndicator.innerHTML = `<span style="color:var(--accent-secondary)">${message.group.members.length} member(s)</span>`;

                const groupModal = document.getElementById('groupInfoModal');
                if (groupModal && groupModal.classList.contains('active')) {
                    updateModalMembersList(message.group);
                }
            }
        }

        if (message.type === "group_deleted") {
            delete customGroups[message.groupId];
            renderGroupsList();
            if (mode === "group" && selectedGroupId === message.groupId) {
                selectedGroupId = null;
                mode = "none";
                chatUser.textContent = "Welcome";
                modeIndicator.textContent = "Select a user or group to start chatting.";
                chatHeaderAvatar.innerHTML = '<i class="fa-solid fa-hand-wave"></i>';
                messagesDiv.innerHTML = "";
                if (document.getElementById('addMemberBtn')) document.getElementById('addMemberBtn').style.display = "none";
                if (document.getElementById('deleteGroupBtn')) document.getElementById('deleteGroupBtn').style.display = "none";
                closeModal('groupInfoModal');
            }
        }

        if (message.type === "group_chat") {
            if (!chats.group[message.groupId]) chats.group[message.groupId] = [];
            chats.group[message.groupId].push(message);

            if (message.userId !== currentUserId && (mode !== "group" || selectedGroupId !== message.groupId)) {
                audio.currentTime = 0;
                audio.play().catch(() => { });
                const grp = customGroups[message.groupId] || { name: "Group" };
                showNotification(`💬 ${grp.name}: ${message.username}`, message.text);
            }

            if (mode === "group" && selectedGroupId === message.groupId) {
                appendMessage(message);
                if (message.userId !== currentUserId) generateAiReplies(message.text);
            }
        }

        // PRIVATE CHAT
        if (message.type === "private") {
            const otherUserId = message.from === currentUserId ? selectedUser?.userId : message.from;

            if (!chats.private[otherUserId]) chats.private[otherUserId] = [];

            // Check if msg already exists
            if (!chats.private[otherUserId].find(m => m.msgId === message.msgId)) {
                chats.private[otherUserId].push(message);

                if (message.from !== currentUserId && mode === "private" && selectedUser?.userId === message.from) {
                    socket.send(JSON.stringify({ type: "status", status: "seen", to: message.from, msgId: message.msgId }));
                    generateAiReplies(message.text);
                }

                if (message.from !== currentUserId && (!selectedUser || selectedUser.userId !== otherUserId)) {
                    audio.currentTime = 0;
                    audio.play().catch(() => { });
                    showNotification(`📩 ${message.username}`, message.text);
                }

                if (mode === "private" && selectedUser?.userId === otherUserId) {
                    appendMessage(message);
                }
                // Redundant reconnect removed
            }
        }

        // NOTIFICATION
        if (message.type === "notification") {
            const div = document.createElement("div");
            div.className = "notification";
            div.textContent = message.text;
            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    };
}


// ===== NOTIFICATIONS & AUDIO =====
if ("Notification" in window) Notification.requestPermission();
const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
audio.preload = "auto";
document.addEventListener("click", () => {
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => { });
}, { once: true });

function showNotification(title, body, iconUrl) {
    // Browser notification
    if (Notification.permission === "granted") {
        const notification = new Notification(title, { body, icon: iconUrl || "https://cdn-icons-png.flaticon.com/512/2462/2462719.png" });
        setTimeout(() => notification.close(), 4000);
        notification.onclick = () => window.focus();
    }
    // In-app toast
    showToast(title, body);
}

function showToast(title, body, type = "message") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const icons = { message: "💬", success: "✅", error: "⚠️", info: "ℹ️" };
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || "💬"}</span>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${body}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("removing");
        setTimeout(() => toast.remove(), 350);
    }, 3800);
}

// ===== AVATAR HELPERS =====
const AVATAR_GRADIENTS = [
    "avatar-grad-0", "avatar-grad-1", "avatar-grad-2",
    "avatar-grad-3", "avatar-grad-4", "avatar-grad-5"
];
function getAvatarClass(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
function makeInitialsAvatar(label) {
    const words = label.trim().split(/\s+/);
    const initials = words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : label.substring(0, 2).toUpperCase();
    const gradClass = getAvatarClass(label);
    const el = document.createElement("div");
    el.className = `user-avatar ${gradClass}`;
    el.textContent = initials;
    return el;
}

// ===== DOM =====
const authScreen = document.getElementById("authScreen");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authLoader = document.getElementById("authLoader");
const authErrorBox = document.getElementById("authErrorBox");
const authErrorMessage = document.getElementById("authErrorMessage");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const authSubtitle = document.getElementById("authSubtitle");
const authToggleText = document.getElementById("authToggleText");
const authToggleLink = document.getElementById("authToggleLink");

const chatScreen = document.getElementById("chatScreen");
const messagesDiv = document.getElementById("messages");
const usersDiv = document.getElementById("users");
const messageInput = document.getElementById("messageInput");
const chatUser = document.getElementById("chatUser");
const onlineCountDiv = document.getElementById("onlineCount");
const modeIndicator = document.getElementById("modeIndicator");
const currentUserDisplay = document.getElementById("currentUserDisplay");
const groupsList = document.getElementById("groupsList");
const addMemberBtn = document.getElementById("addMemberBtn");
const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");

// AI UI
const aiSuggestionsPanel = document.getElementById("aiSuggestions");
const aiPillsContainer = document.getElementById("aiPillsContainer");

// ===== STATE =====
let mode = "none";
let selectedUser = null;
let selectedGroupId = null;
let customGroups = {};
let chats = { group: {}, private: {} };
let currentUserId = localStorage.getItem("userId") || null;
let currentUsername = localStorage.getItem("username") || null;
const myConnectionId = document.getElementById("myConnectionId");

// Auto-login on page load if a stored userId exists
document.addEventListener("DOMContentLoaded", () => {
    if (currentUserId) {
        // Attempt silent reconnect — show chat screen immediately and authenticate via WS
        authScreen.style.display = "none";
        chatScreen.style.display = "flex";
        connectWS();
    } else {
        authScreen.style.display = "flex";
        chatScreen.style.display = "none";
    }

    // Allow Enter key to submit group creation from the modal input
    const newGroupInput = document.getElementById("newGroupNameInput");
    if (newGroupInput) {
        newGroupInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") { e.preventDefault(); submitCreateGroup(); }
        });
    }

    // Allow Enter key for adding a member from the modal input  
    const addMemberInput = document.getElementById("addMemberInput");
    if (addMemberInput) {
        addMemberInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") { e.preventDefault(); submitAddMember(); }
        });
    }
});

function toggleAuthMode() {
    socketMode = socketMode === "login" ? "signup" : "login";
    authErrorBox.style.display = "none";
    passwordInput.value = "";

    if (socketMode === "signup") {
        authSubtitle.textContent = "Create your new account.";
        authSubmitBtn.querySelector("span").textContent = "Sign Up";
        authToggleText.textContent = "Already have an account?";
        authToggleLink.textContent = "Login here";
    } else {
        authSubtitle.textContent = "Log in to your workspace.";
        authSubmitBtn.querySelector("span").textContent = "Login";
        authToggleText.textContent = "New to Nexora Chat?";
        authToggleLink.textContent = "Create an account";
    }
}

function submitAuth() {
    const un = usernameInput.value.trim();
    const pw = passwordInput.value;

    if (!un || pw.length < 6) {
        authErrorMessage.textContent = "Username required and password must be 6+ characters.";
        authErrorBox.style.display = "flex";
        return;
    }

    setAuthLoading(true);

    // Initialize websocket connection for auth cycle
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectWS();

        setTimeout(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                submitAuth();
            }
        }, 500);

        return;
    }

    if (socketMode === "signup") {
        socket.send(JSON.stringify({ type: "register", username: un, password: pw, userId: currentUserId }));
    } else {
        socket.send(JSON.stringify({ type: "login", username: un, password: pw }));
    }
}

function showAuthError(msg) {
    setAuthLoading(false);
    authErrorMessage.textContent = msg;
    authErrorBox.style.display = "flex";
}

function setAuthLoading(isLoading) {
    authSubmitBtn.disabled = isLoading;
    authSubmitBtn.querySelector("span").style.opacity = isLoading ? "0" : "1";
    authLoader.style.display = isLoading ? "block" : "none";
}

let typingTimer = null;

function generateId() {
    return Math.random().toString(36).substring(2, 12);
}

function handleAuthSuccess(user, newUserId, history, groups) {
    setAuthLoading(false);
    currentUsername = user.username;

    if (newUserId) {
        currentUserId = newUserId;
        localStorage.setItem("userId", currentUserId);
    }
    localStorage.setItem("username", currentUsername);

    if (groups) customGroups = groups;

    // Load history
    if (history) {
        chats.group = history.group || {};
        chats.private = history.private || {};
    }

    if (myConnectionId) myConnectionId.textContent = "ID: " + currentUserId;
    currentUserDisplay.textContent = currentUsername;

    // Update sidebar profile avatar with initials
    const myAvatarEl = document.getElementById("myAvatarEl");
    if (myAvatarEl) {
        const gradClass = getAvatarClass(currentUsername);
        const initials = currentUsername.substring(0, 2).toUpperCase();
        myAvatarEl.className = `avatar ${gradClass}`;
        myAvatarEl.textContent = initials;
    }

    // Transition to chat screen (hide auth, show chat)
    authScreen.style.display = "none";
    chatScreen.style.display = "flex";

    renderGroupsList();
    // Only auto-select a default room when arriving fresh (not during silent reconnect)
    if (mode === "none") {
        if (Object.keys(customGroups).length > 0) {
            selectGroup(Object.keys(customGroups)[0]);
        } else {
            chatUser.textContent = "Welcome";
            modeIndicator.textContent = "Join a group or connect with someone.";
            chatHeaderAvatar.innerHTML = '<i class="fa-solid fa-hand-wave"></i>';
            messagesDiv.innerHTML = "";
        }
    }
}

function logout(ask = true) {
    if (!ask || confirm("Are you sure you want to sign out?")) {
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        authScreen.style.display = "flex";
        chatScreen.style.display = "none";
        mode = "none";
        selectedUser = null;
        selectedGroupId = null;
    }
}

// ===== SELECT USER =====
function selectUser(user) {
    mode = "private";
    selectedUser = user;
    chatUser.textContent = user.username;
    modeIndicator.textContent = "Private Chat • End-to-End Encrypted";
    chatHeaderAvatar.innerHTML = '<i class="fa-solid fa-user text-gradient"></i>';
    selectedGroupId = null;
    if (addMemberBtn) addMemberBtn.style.display = "none";
    updateUserListStyles();
    updateGroupListStyles();
    renderMessages();
    hideAiSuggestions();

    // Mark unseen messages as seen
    const history = chats.private[selectedUser.userId] || [];
    history.forEach(m => {
        if (m.from !== currentUserId && m.status !== "seen") {
            m.status = "seen";
            socket.send(JSON.stringify({ type: "status", status: "seen", to: user.userId, msgId: m.msgId }));
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

// Tracks the pending group ID so we can auto-select it once the server confirms creation
let pendingNewGroupId = null;

function createGroup() {
    document.getElementById("newGroupNameInput").value = "";
    openModal('createGroupModal');
    // Focus the input after modal animates in
    setTimeout(() => document.getElementById("newGroupNameInput").focus(), 50);
}

function submitCreateGroup() {
    const input = document.getElementById("newGroupNameInput");
    const name = input.value;
    if (!name || name.trim() === "") return;
    const groupId = "g_" + generateId();
    if (socket && socket.readyState === WebSocket.OPEN) {
        pendingNewGroupId = groupId; // remember so we auto-select on group_update
        socket.send(JSON.stringify({ type: "create_group", name: name.trim(), groupId }));
        closeModal('createGroupModal');
    }
}

function selectGroup(groupId) {
    if (!customGroups[groupId]) return;
    mode = "group";
    selectedUser = null;
    selectedGroupId = groupId;
    const group = customGroups[groupId];

    chatUser.textContent = group.name;
    modeIndicator.innerHTML = `<span style="color:var(--accent-secondary)">${group.members.length} member(s)</span>`;
    chatHeaderAvatar.innerHTML = '<i class="fa-solid fa-users text-gradient"></i>';
    if (addMemberBtn) addMemberBtn.style.display = "flex";
    const delBtn = document.getElementById("deleteGroupBtn");
    if (delBtn) delBtn.style.display = group.creatorId === currentUserId ? "flex" : "none";

    updateUserListStyles();
    updateGroupListStyles();
    renderMessages();
    hideAiSuggestions();
}

function updateGroupListStyles() {
    const divs = document.querySelectorAll('#groupsList .user');
    divs.forEach(div => {
        if (selectedGroupId && div.dataset.gid === selectedGroupId) div.classList.add("active");
        else div.classList.remove("active");
    });
}

function renderGroupsList() {
    if (!groupsList) return;
    groupsList.innerHTML = "";
    Object.values(customGroups).forEach(group => {
        const div = document.createElement("div");
        div.className = "user" + (selectedGroupId === group.groupId ? " active" : "");
        div.dataset.gid = group.groupId;

        const avatar = makeInitialsAvatar(group.name);
        div.appendChild(avatar);

        const nameSpan = document.createElement("span");
        nameSpan.className = "user-name";
        nameSpan.textContent = group.name;
        div.appendChild(nameSpan);

        div.onclick = () => selectGroup(group.groupId);
        groupsList.appendChild(div);
    });
}

function addGroupMember() {
    if (mode !== "group" || !selectedGroupId) return;
    const group = customGroups[selectedGroupId];
    if (!group) return;

    document.getElementById("modalGroupName").textContent = group.name;
    document.getElementById("addMemberInput").value = "";
    updateModalMembersList(group);

    openModal('groupInfoModal');
}

function updateModalMembersList(group) {
    const list = document.getElementById("modalMembersList");
    if (!list) return;
    list.innerHTML = "";

    group.members.forEach(mId => {
        const div = document.createElement("div");
        div.className = "user";

        const label = mId === currentUserId ? (currentUsername || mId) : "User-" + mId.substring(0, 6);
        const avatar = makeInitialsAvatar(label);
        div.appendChild(avatar);

        const nameSpan = document.createElement("span");
        nameSpan.className = "user-name";
        nameSpan.textContent = mId === currentUserId ? "You" : label;
        if (mId === group.creatorId) {
            const badge = document.createElement("span");
            badge.textContent = " Admin";
            badge.style.cssText = "font-size:0.65rem;color:var(--accent-secondary);background:rgba(108,92,231,0.15);padding:1px 6px;border-radius:9px;margin-left:5px;";
            nameSpan.appendChild(badge);
        }
        div.appendChild(nameSpan);

        if (group.creatorId === currentUserId && mId !== currentUserId) {
            const removeBtn = document.createElement("button");
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            removeBtn.className = "remove-member-btn";
            removeBtn.title = "Remove member";
            removeBtn.onclick = () => {
                if (confirm("Remove this member from the group?")) {
                    socket.send(JSON.stringify({ type: "remove_member", groupId: group.groupId, userId: mId }));
                }
            };
            div.appendChild(removeBtn);
        }

        list.appendChild(div);
    });
}

function deleteGroup() {
    if (mode !== "group" || !selectedGroupId) return;
    const group = customGroups[selectedGroupId];
    if (group && group.creatorId === currentUserId) {
        if (confirm("Are you sure you want to delete this group?")) {
            socket.send(JSON.stringify({ type: "delete_group", groupId: selectedGroupId }));
        }
    }
}

function submitAddMember() {
    const input = document.getElementById("addMemberInput");
    const userIdToAdd = input.value;
    if (mode !== "group" || !selectedGroupId || !userIdToAdd || userIdToAdd.trim() === "") return;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "add_member", groupId: selectedGroupId, userId: userIdToAdd.trim() }));
        input.value = "";
    }
}

function updateUserListStyles() {
    const userDivs = document.querySelectorAll('.user');
    userDivs.forEach(div => {
        if (selectedUser && div.dataset.uid === selectedUser.userId) div.classList.add("active");
        else div.classList.remove("active");
    });
}

// ===== CONNECT BY ID =====
function showConnectInput() {
    const wrapper = document.getElementById("connectInputWrapper");
    wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
    if (wrapper.style.display === "block") {
        document.getElementById("connectIdInput").focus();
    }
}

function connectToUser() {
    const targetId = document.getElementById("connectIdInput").value.trim();
    if (!targetId || targetId === currentUserId) return;

    // Default fallback username until they msg back
    let targetUsername = "User-" + targetId.substring(0, 4);

    if (!chats.private[targetId]) {
        chats.private[targetId] = [];
    }

    // Select the newly attached user visually
    selectUser({ userId: targetId, username: targetUsername });

    // Hide input field after connect
    document.getElementById("connectInputWrapper").style.display = "none";
    document.getElementById("connectIdInput").value = "";
}

// ===== TYPING INDICATOR =====
messageInput.addEventListener("input", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "typing", isTyping: true,
            channelMode: mode,
            to: mode === "private" ? selectedUser?.userId : null
        }));
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.send(JSON.stringify({
                type: "typing", isTyping: false,
                channelMode: mode,
                to: mode === "private" ? selectedUser?.userId : null
            }));
        }, 1500);
    }
});

let headerTypingTimer = null;
function showHeaderTyping(username, isTyping) {
    if (isTyping) {
        modeIndicator.innerHTML = `<span style="color:var(--accent-secondary);display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-pen-to-square" style="font-size:0.7rem;"></i> ${username} is typing
            <span class="typing-dots"><span></span><span></span><span></span></span>
        </span>`;
        clearTimeout(headerTypingTimer);
        headerTypingTimer = setTimeout(() => {
            restoreHeaderSubtitle();
        }, 2600);
    } else {
        restoreHeaderSubtitle();
    }
}

function restoreHeaderSubtitle() {
    if (mode === "group" && selectedGroupId && customGroups[selectedGroupId]) {
        const g = customGroups[selectedGroupId];
        modeIndicator.innerHTML = `<span style="color:var(--accent-secondary)">${g.members.length} member(s)</span>`;
    } else if (mode === "private") {
        modeIndicator.textContent = "Private Chat • End-to-End Encrypted";
    }
}

// ===== AI SMART REPLIES (MOCK) =====
function generateAiReplies(incomingText) {
    const text = incomingText.toLowerCase();
    let replies = ["Got it, thanks!", "Can you clarify?", "Sounds good to me."];
    if (text.includes("hello") || text.includes("hi")) replies = ["Hello there!", "Hi, how are you?", "Hey! What's up?"];
    else if (text.includes("meeting") || text.includes("call")) replies = ["I'm available.", "Send me the link.", "Let's reschedule."];
    else if (text.includes("help")) replies = ["How can I assist?", "I'll be right there.", "What's the issue?"];
    else if (text.includes("?")) replies = ["I think so.", "Let me check and get back to you.", "No, I don't think so."];

    aiPillsContainer.innerHTML = "";
    replies.forEach(reply => {
        const pill = document.createElement("div");
        pill.className = "ai-pill";
        pill.textContent = reply;
        pill.onclick = () => { messageInput.value = reply; sendMessage(); hideAiSuggestions(); };
        aiPillsContainer.appendChild(pill);
    });
    aiSuggestionsPanel.style.display = "flex";
}
function hideAiSuggestions() { aiSuggestionsPanel.style.display = "none"; }

// ===== SEND MESSAGE =====
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !socket) return;
    const msgId = generateId();

    if (mode === "private" && selectedUser) {
        socket.send(JSON.stringify({ type: "private", msgId, to: selectedUser.userId, text }));
    } else if (mode === "group" && selectedGroupId) {
        socket.send(JSON.stringify({ type: "group_chat", msgId, groupId: selectedGroupId, text }));
    }
    messageInput.value = "";

    // Stop typing
    socket.send(JSON.stringify({ type: "typing", isTyping: false, channelMode: mode, to: mode === "private" ? selectedUser?.userId : null }));
    clearTimeout(typingTimer);
    hideAiSuggestions();
}

messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

// ===== RENDER MESSAGES =====
function appendMessage(message) {
    const isMe = (message.type === "group_chat" && message.userId === currentUserId) || (message.type === "private" && message.from === currentUserId);

    // Create UI Elements
    const div = document.createElement("div");
    div.className = isMe ? "message me" : "message other";
    div.id = `msg_${message.msgId}`; // Tag the DOM element for direct access

    if (message.type === "group_chat" && !isMe) {
        const senderSpan = document.createElement("span");
        senderSpan.className = "msg-sender";
        senderSpan.textContent = message.username;
        div.appendChild(senderSpan);
    }
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    const textNode = document.createElement("span");
    textNode.textContent = message.text;
    bubble.appendChild(textNode);

    // Timestamp
    const timeEl = document.createElement("span");
    timeEl.className = "msg-time";
    const ts = message.timestamp ? new Date(message.timestamp) : new Date();
    timeEl.textContent = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(timeEl);

    if (isMe && message.type === "private") {
        const statusSpan = document.createElement("span");
        statusSpan.className = "msg-status";
        statusSpan.id = `status_${message.msgId}`;

        let ticks = '<i class="fa-solid fa-check"></i>';
        if (message.status === "delivered") ticks = '<i class="fa-solid fa-check-double"></i>';
        if (message.status === "seen") ticks = '<i class="fa-solid fa-check-double" style="color:var(--success)"></i>';

        statusSpan.innerHTML = ticks;
        bubble.appendChild(statusSpan);
    }
    div.appendChild(bubble);
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderMessages() {
    messagesDiv.innerHTML = "";
    let messages = [];
    if (mode === "group" && selectedGroupId) {
        messages = chats.group[selectedGroupId] || [];
    } else if (mode === "private" && selectedUser) {
        messages = chats.private[selectedUser?.userId] || [];
    }
    messages.forEach(message => appendMessage(message));
}

function updateMessageStatusUI(msgId, status) {
    const statusSpan = document.getElementById(`status_${msgId}`);
    if (statusSpan) {
        let ticks = '<i class="fa-solid fa-check"></i>';
        if (status === "delivered") ticks = '<i class="fa-solid fa-check-double"></i>';
        if (status === "seen") ticks = '<i class="fa-solid fa-check-double" style="color:var(--success)"></i>';
        statusSpan.innerHTML = ticks;
    }
}