/* ============================================
   LOVARA - Setup Admin User
   Run this in browser console to make a user admin
   ============================================ */

// Function to set a user as admin
async function setAdmin(userId) {
  if (!userId) {
    console.error('❌ Please provide a user ID');
    console.log('Usage: setAdmin("USER_ID_HERE")');
    return;
  }

  try {
    const db = firebase.firestore();
    await db.collection('users').doc(userId).update({
      role: 'admin',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ User', userId, 'is now an admin!');
  } catch (error) {
    console.error('❌ Error setting admin:', error.message);
    console.log('Make sure the user document exists in Firestore first.');
  }
}

// Function to create admin user with email/password
async function createAdminUser(email, password, name) {
  try {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Create user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update profile
    await user.updateProfile({ displayName: name });

    // Create user document with admin role
    await db.collection('users').doc(user.uid).set({
      email: email,
      name: name,
      role: 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Admin user created successfully!');
    console.log('User ID:', user.uid);
    console.log('Email:', email);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
  }
}

// Function to check current user role
async function checkRole() {
  const user = firebase.auth().currentUser;
  if (!user) {
    console.log('❌ No user is currently logged in');
    return;
  }

  try {
    const db = firebase.firestore();
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      console.log('User:', user.email);
      console.log('Role:', doc.data().role || 'user');
    } else {
      console.log('❌ User document not found in Firestore');
    }
  } catch (error) {
    console.error('❌ Error checking role:', error.message);
  }
}

// Quick usage:
// setAdmin("USER_ID") - Make existing user admin
// createAdminUser("admin@lovara.com", "password123", "Admin") - Create new admin
// checkRole() - Check current user role

console.log('LOVARA Admin Setup loaded');
console.log('Available functions: setAdmin(userId), createAdminUser(email, password, name), checkRole()');