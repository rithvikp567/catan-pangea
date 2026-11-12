/**
 * Firebase web-app config for the "catan-pangea" project. These values are
 * public by design (they only identify the project; access is governed by
 * database.rules.json), so it is fine to commit them.
 *
 * Set to null to run in "this device only" mode (e.g. for a fork without
 * its own Firebase project). Setup steps: context.md → "Firebase setup".
 * Only the Realtime Database is used — no Analytics, Auth or Hosting.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbvu6BRGLY16x_xeHDV17SSLhVMNExl9g",
  authDomain: "catan-pangea.firebaseapp.com",
  databaseURL: "https://catan-pangea-default-rtdb.firebaseio.com",
  projectId: "catan-pangea",
  storageBucket: "catan-pangea.firebasestorage.app",
  messagingSenderId: "261427052290",
  appId: "1:261427052290:web:5ae521ce717911d6a84c1b",
};
