import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

const firebaseConfig = {
    apiKey: "AIzaSyC787tLKvQIlPplTFyTDMXfoNV5RrdbHP",
    authDomain: "allstar-123.firebaseapp.com",
    projectId: "allstar-123",
    storageBucket: "allstar-123.firebasestorage.app",
    messagingSenderId: "1008239410434",
    appId: "1:1008239410434:web:fc5f069086e2fc63b4d61b"
};

const app = initializeApp(firebaseConfig);

export { app };