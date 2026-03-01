import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // 🌟 引入 Firestore 数据库模块

// 这是你专属的 LearningTree Dayhome 配置密钥
const firebaseConfig = {
  apiKey: "AIzaSyDSVoDKuzXdtSD6-Z1iOV5iAG6jZiDP68g",
  authDomain: "learning-tree-dayhom.firebaseapp.com",
  projectId: "learning-tree-dayhom",
  storageBucket: "learning-tree-dayhom.firebasestorage.app",
  messagingSenderId: "817157534029",
  appId: "1:817157534029:web:2b9617610abd39c99a8704",
  measurementId: "G-T0LG6Y3MH5"
};

// 启动 Firebase 引擎
const app = initializeApp(firebaseConfig);

// 🌟 导出 db (数据库)，这样你的 App.jsx 就能直接存取名单了！
export const db = getFirestore(app);