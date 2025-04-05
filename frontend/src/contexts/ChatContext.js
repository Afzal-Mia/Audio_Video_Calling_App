import React, {
  useContext,
  createContext,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import axios from "axios";

// Contexts
import { useToast } from "./ToastContext";
import { useAuth } from "./AuthContext";

// Socket
const chatContext = createContext(null);
let socket;
const getSocket = () => {
  if (!socket) {
    socket = io("https://audio-video-calling-app-tz0q.onrender.com");
  }
  return socket;
};

const ChatContext = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { notifySuccess, notifyError, notifyWarning } = useToast();

  const socket = useMemo(() => getSocket(), []);

  const [messages, setMessages] = useState([]);
  const [chatList, setChatList] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState({});
  const [selectedChatUserId, setSelectedChatUserId] = useState("");
  const [totalUnseenMsgCount, setTotalUnseenMsgCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState();
  const [selectedFilePrev, setSelectedFilePrev] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [productUrl, setProductUrl] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isCallbackRequest, setIsCallBackRequest] = useState(false);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [isBlockedMe, setIsblockedByMe] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatListLoading, setIsChatListLoading] = useState(true);
  const [isMessageSent, setIsMessageSent] = useState(false);

  const sendMessage = (peerId, message, fileUrl, productUrl) => {
    if (socket) {
      socket.emit("privateMessage", {
        senderId: user.userId,
        receiverId: peerId,
        message,
        fileUrl,
        productUrl,
      });
    }
  };

  const fetchChatsLists = useCallback(async () => {
    if (user.userId) {
      try {
        const response = await fetch(
          `https://audio-video-calling-app-tz0q.onrender.com/users/chatlists/chat-list/${user.userId}`
        );
        const data = await response.json();
        setIsChatListLoading(false);
        setChatList(data.userDetails);
        setTotalUnseenMsgCount(data.totalUnseenCount);
      } catch (err) {
        notifyError("Error fetching chats:" + err);
        setIsChatListLoading(false);
      }
    }
  }, [user.userId, notifyError]);

  const markMessagesAsSeen = useCallback(async (chatId) => {
    try {
      await axios.put(
        `https://audio-video-calling-app-tz0q.onrender.com/users/chats/mark-seen/${chatId}`,
        { currentUserId }
      );

      setChatList((prevList) => {
        let unseenMessagesCountToSubtract = 0;
        const updatedList = prevList.map((partner) => {
          if (partner.chatPartner.peerId === selectedChatUserId) {
            unseenMessagesCountToSubtract = partner.unseenMessagesCount;
            return {
              ...partner,
              ...partner.chatPartner,
              unseenMessagesCount: 0,
            };
          }
          return partner;
        });
        setTotalUnseenMsgCount(
          (prevTotal) => prevTotal - unseenMessagesCountToSubtract
        );
        return updatedList;
      });
    } catch (error) {
      console.error("Error marking messages as seen:", error);
    }
  }, [currentUserId, selectedChatUserId]);

  const fetchChatMessages = useCallback(async (peerId) => {
    if (peerId) {
      try {
        const response = await fetch(
          `https://audio-video-calling-app-tz0q.onrender.com/users/chats/${user.userId}/${peerId}`
        );
        if (!response.ok) throw new Error("Failed to fetch messages");
        const chat = await response.json();
        setChatId(chat.chat ? chat.chat._id : null);
        setMessages(chat.messages || []);
      } catch {
        setMessages([]);
      }
    }
  }, [user.userId]);

  const deleteMessage = async (messageId, senderId) => {
    if (messageId && senderId) {
      try {
        const response = await fetch(
          `https://audio-video-calling-app-tz0q.onrender.com/users/chats/delete-message/${messageId}?senderId=${senderId}`,
          { method: "DELETE" }
        );
        const data = await response.json();
        if (response.ok) {
          setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
          notifyWarning(data.message);
        }
      } catch (error) {
        notifyError("Failed to delete message:" + error);
      }
    }
  };

  const deleteChat = async () => {
    if (selectedChatUserId && currentUserId && chatId) {
      try {
        const response = await fetch(
          `https://audio-video-calling-app-tz0q.onrender.com/users/chats/delete-chat/${chatId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUserId }),
          }
        );
        if (response.ok) {
          const result = await response.json();
          fetchChatMessages(selectedChatUserId);
          notifyWarning(result.message);
        }
      } catch (error) {
        notifyError("Error:" + error);
      }
    }
  };

  const fetchBlockedUsers = useCallback(async (userId) => {
    if (!userId) {
      notifyError("User Id not found");
      return [];
    }
    try {
      const response = await fetch(
        `https://audio-video-calling-app-tz0q.onrender.com/users/auth/blocked-users/${userId}`
      );
      if (!response.ok) throw new Error("Failed to fetch blocked users");
      const data = await response.json();
      return data ? data.blockedUsers : [];
    } catch (error) {
      notifyError("Error fetching blocked users:" + error);
      return [];
    }
  }, [notifyError]);

  const blockUser = async () => {
    if (selectedChatUserId) {
      try {
        const response = await fetch(
          `https://audio-video-calling-app-tz0q.onrender.com/users/auth/block-user/${user.userId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockedUserId: selectedChatUserId }),
          }
        );

        if (!response.ok) throw new Error("Failed to block/unblock user");

        if (socket) {
          socket.emit("blocked", { selectedChatUserId });
        }
        const userBlockedList = await fetchBlockedUsers(user.userId);
        setIsblockedByMe(userBlockedList.includes(selectedChatUserId));
      } catch (error) {
        notifyError("Error:" + error);
      }
    }
  };

  const sendCallbackRequest = async () => {
    const sendData = {
      buyerName: user.name,
      buyerEmail: user.email,
      buyerPhoneNumber: user.phoneNumber,
      currentUserId,
      profile: user.profile,
      sellerEmail: selectedUser.email,
      sellerUserId: selectedChatUserId,
    };
    if (sendData) {
      setIsRequesting(true);
      try {
        const response = await fetch(
          "https://audio-video-calling-app-tz0q.onrender.com/users/send-call-back-request",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sendData),
          }
        );
        const data = await response.json();
        if (response.ok) {
          notifySuccess(data.message);
          if (socket) {
            socket.emit("sendNotification", {
              selectedChatUserId,
              name: selectedUser.name,
            });
          }
          setIsRequesting(false);
          setIsCallBackRequest(false);
        } else {
          notifyError(data.message);
          setIsRequesting(false);
        }
      } catch (err) {
        notifyError(err);
        setIsRequesting(false);
        throw err;
      }
    } else {
      notifyError("Try again");
    }
  };

  useEffect(() => {
    if (!socket) return;
    const notifyBlockedUser = async () => {
      if (selectedChatUserId) {
        const selectedUserBlockedList = await fetchBlockedUsers(
          selectedChatUserId
        );
        setIsUserBlocked(selectedUserBlockedList.includes(currentUserId));
      }
    };
    socket.on("notifyBlocked", notifyBlockedUser);
    return () => {
      socket.off("notifyBlocked", notifyBlockedUser);
    };
  }, [socket, selectedChatUserId, currentUserId, fetchBlockedUsers]);

  useEffect(() => {
    const fetchBlockedStatus = async () => {
      if (selectedChatUserId) {
        const userBlockedList = await fetchBlockedUsers(currentUserId);
        const selectedUserBlockedList = await fetchBlockedUsers(
          selectedChatUserId
        );
        setIsblockedByMe(userBlockedList.includes(selectedChatUserId));
        setIsUserBlocked(selectedUserBlockedList.includes(currentUserId));
      }
    };
    fetchBlockedStatus();
  }, [currentUserId, selectedChatUserId, fetchBlockedUsers]);

  useEffect(() => {
    if (currentUserId) fetchChatsLists();
  }, [currentUserId, fetchChatsLists]);

  useEffect(() => {
    if (isAuthenticated) {
      setCurrentUserId(user.userId);
      if (socket) {
        socket.emit("joinChat", user.userId);
        socket.emit("activeUser", user.userId);
      }
    }
  }, [isAuthenticated, user, socket]);

  useEffect(() => {
    if (!socket) return;
    const handleActiveUsers = (users) => {
      setActiveUsers(users);
    };
    socket.on("updateActiveUsers", handleActiveUsers);
    return () => {
      socket.off("updateActiveUsers", handleActiveUsers);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleMessageReceived = ({
      senderId,
      receiverId,
      message,
      fileUrl,
      productUrl,
      timestamp,
    }) => {
      fetchChatsLists();
      const isCurrentChat =
        (currentUserId === receiverId && selectedChatUserId === senderId) ||
        (currentUserId === senderId && selectedChatUserId === receiverId);

      if (isCurrentChat) {
        setMessages((prevMessages) => [
          ...prevMessages,
          { senderId, receiverId, message, fileUrl, productUrl, timestamp },
        ]);
        setIsMessageSent(true);
      }

      if (receiverId === currentUserId && !isCurrentChat) {
        notifySuccess("New message received");
        fetchChatsLists();
      }

      if (selectedChatUserId) {
        fetchChatMessages(selectedChatUserId);
      }
    };

    socket.on("messageReceived", handleMessageReceived);
    return () => {
      socket.off("messageReceived", handleMessageReceived);
    };
  }, [
    socket,
    currentUserId,
    selectedChatUserId,
    isChatOpen,
    fetchChatMessages,
    fetchChatsLists,
    notifySuccess,
  ]);

  return (
    <chatContext.Provider
      value={{
        socket,
        sendMessage,
        messages,
        chatList,
        selectedChatUserId,
        setSelectedChatUserId,
        fetchChatsLists,
        fetchChatMessages,
        deleteMessage,
        blockUser,
        isUserBlocked,
        isBlockedMe,
        isRequesting,
        selectedFilePrev,
        setSelectedFilePrev,
        selectedFile,
        setSelectedFile,
        productUrl,
        setProductUrl,
        deleteChat,
        fetchBlockedUsers,
        currentUserId,
        isCallbackRequest,
        setIsCallBackRequest,
        setIsUserBlocked,
        setIsblockedByMe,
        setCurrentUserId,
        sendCallbackRequest,
        setSelectedUser,
        selectedUser,
        chatId,
        setChatId,
        isChatOpen,
        setIsChatOpen,
        isChatListLoading,
        markMessagesAsSeen,
        setChatList,
        totalUnseenMsgCount,
        activeUsers,
        isMessageSent,
      }}
    >
      {children}
    </chatContext.Provider>
  );
};

export default ChatContext;

export const useChat = () => {
  return useContext(chatContext);
};
