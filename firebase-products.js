import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { app } from "./firebase.js";

const db = getFirestore(app);

export { db, collection, addDoc, getDocs, deleteDoc, doc };