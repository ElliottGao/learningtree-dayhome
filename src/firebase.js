import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDSVoDKuzXdtSD6-Z1iOV5iAG6jZiDP68g",
  authDomain: "learning-tree-dayhom.firebaseapp.com",
  projectId: "learning-tree-dayhom",
  storageBucket: "learning-tree-dayhom.firebasestorage.app",
  messagingSenderId: "817157534029",
  appId: "1:817157534029:web:2b9617610abd39c99a8704",
  measurementId: "G-T0LG6Y3MH5"
};

const app = initializeApp(firebaseConfig);

// 🌟 关键修复：明确告诉系统，我们的数据库名字叫 "dayhome"
export const db = getFirestore(app, "dayhome");