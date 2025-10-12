// אתחול Firestore
const db = firebase.firestore();
let currentUserEmail = "";

// Authentication עם Gmail
const auth = firebase.auth();
const loginBtn = document.getElementById("login-btn");
const userEmailSpan = document.getElementById("user-email");

loginBtn.addEventListener("click", () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
});

auth.onAuthStateChanged(user => {
  if (user) {
    currentUserEmail = user.email;
    userEmailSpan.textContent = `מחובר כ: ${currentUserEmail}`;
    loginBtn.style.display = "none";
    document.getElementById("expense-form").style.display = "flex";
  } else {
    currentUserEmail = "";
    userEmailSpan.textContent = "";
    loginBtn.style.display = "inline-block";
    document.getElementById("expense-form").style.display = "none";
  }
});

// הוספת הוצאה
const form = document.getElementById("expense-form");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentUserEmail) return alert("אנא התחבר קודם");

  const description = document.getElementById("description").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const date = new Date();

  db.collection("expenses").add({
    description,
    amount,
    category,
    date: firebase.firestore.Timestamp.fromDate(date),
    user: currentUserEmail
  }).then(() => form.reset());
});

// אלמנטים להצגה
const userSummaryList = document.getElementById("user-summary-list");
const expensesTableBody = document.querySelector("#expenses-table tbody");
const monthInput = document.getElementById("month-input");
const yearInput = document.getElementById("year-input");
const filterBtn = document.getElementById("filter-btn");
const monthlySummary = document.getElementById("monthly-summary");

// אתחול חודש ושנה נוכחיים
const today = new Date();
monthInput.value = today.getMonth() + 1;
yearInput.value = today.getFullYear();

// פונקציה לעדכון תצוגה
function updateDisplay(snapshot) {
  // סיכום לפי משתמש
  const totalsByUser = {};
  let totalSum = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    totalsByUser[data.user] = (totalsByUser[data.user] || 0) + data.amount;
    totalSum += data.amount;
  });

  // סיכום משתמשים
  userSummaryList.innerHTML = "";
  const colors = ["#e6194B","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#46f0f0","#f032e6"];
  let i = 0;
  for (const [user, sum] of Object.entries(totalsByUser)) {
    const li = document.createElement("li");
    li.textContent = `${user}: ₪${sum} (${((sum/totalSum)*100).toFixed(1)}%)`;
    li.style.color = colors[i % colors.length];
    i++;
    userSummaryList.appendChild(li);
  }

  // רשימת הוצאות מלאה
  expensesTableBody.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${data.user}</td>
      <td>${data.date.toDate().toLocaleDateString()}</td>
      <td>${data.category}</td>
      <td>₪${data.amount}</td>
      <td>${data.description}</td>
    `;
    expensesTableBody.appendChild(tr);
  });

  // סיכום לפי חודש ושנה
  updateMonthlySummary(snapshot);
}

// סיכום לפי חודש ושנה
function updateMonthlySummary(snapshot) {
  const month = parseInt(monthInput.value);
  const year = parseInt(yearInput.value);
  let sum = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const d = data.date.toDate();
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      sum += data.amount;
    }
  });

  monthlySummary.textContent = `סכום הוצאות לחודש ${month}/${year}: ₪${sum}`;
}

// שליפת נתונים מ-Firestore
db.collection("expenses").orderBy("date", "desc").onSnapshot(snapshot => {
  updateDisplay(snapshot);
});

// עדכון סיכום חודשי כשלוחצים על הכפתור
filterBtn.addEventListener("click", () => {
  db.collection("expenses").orderBy("date", "desc").get().then(snapshot => {
    updateMonthlySummary(snapshot);
  });
});
