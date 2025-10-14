/*
 * Family Expenses application script.
 *
 * This module encapsulates all the logic for authentication, transaction
 * management, Firestore integration, monthly overview calculations, period
 * selection and extended analytics. It uses the Firebase SDK (version 12.x)
 * imported in index.html and Chart.js (v4.5.0) for visualizations.  For
 * security, only whitelisted email addresses are allowed to log in.
 */

(function () {
  // Destructure Firebase instances and helper functions from the global scope.
  const { auth, db } = window._firebase;
  const {
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    onSnapshot,
    getDocs
  } = window._firebaseImports;

  // Email whitelist for authorized users. Update these addresses to match
  // those configured in your Firebase project rules.
  const EMAIL_WHITELIST = ['nirzzadik@gmail.com', 'danakatz6113@gmail.com', 'itayzadik10@gmail.com', 'zadikerez@gmail.com'];

  // Define category lists for expenses and incomes.  These lists are based
  // on the PRD and can be modified to suit your needs.
  const expenseCategories = [
    'Groceries',
    'Cloth',
    'Bills Pay',
    'Mortgage Pay',
    'Restaurant',
    'Food Orders',
    'Waste',
    'Home Equipment',
    'Sports',
    'One-Time Expenses'
  ];
  const incomeCategories = [
    'Salary',
    'Debt',
    'Other Income'
  ];

  // Cached DOM references
  const loginSection = document.getElementById('login-section');
  const loginButton = document.getElementById('login-button');
  const loginError = document.getElementById('login-error');

  const appContainer = document.getElementById('app');
  const userNameSpan = document.getElementById('user-name');
  const logoutButton = document.getElementById('logout-button');

  const monthSelect = document.getElementById('month-select');
  const yearSelect = document.getElementById('year-select');
  const currentPeriodEl = document.getElementById('current-period');

  const nirExpenseEl = document.getElementById('nir-expense');
  const danaExpenseEl = document.getElementById('dana-expense');
  const totalExpenseEl = document.getElementById('total-expense');
  const nirIncomeEl = document.getElementById('nir-income');
  const danaIncomeEl = document.getElementById('dana-income');
  const totalIncomeEl = document.getElementById('total-income');

  const nameSelect = document.getElementById('name-select');
  const typeSelect = document.getElementById('type-select');
  const kindSelect = document.getElementById('kind-select');
  const amountInput = document.getElementById('amount-input');
  const submitButton = document.getElementById('submit-button');
  const formError = document.getElementById('form-error');
  const formSuccess = document.getElementById('form-success');
  const transactionForm = document.getElementById('transaction-form');

  const transactionsTableBody = document.getElementById('transactions-table-body');
  const noTransactionsMessage = document.getElementById('no-transactions');

  const openAnalyticsBtn = document.getElementById('open-analytics');
  const analyticsModal = document.getElementById('analytics-modal');
  const closeAnalyticsBtn = document.getElementById('close-analytics');
  const comparisonCardsContainer = document.getElementById('comparison-cards');
  const expenseTrendsCanvas = document.getElementById('expense-trends-chart');

  // Analysis period selectors inside the analytics modal
  const analysisMonthSelect = document.getElementById('analysis-month-select');
  const analysisYearSelect = document.getElementById('analysis-year-select');

  // Placeholder for Chart.js instance; used to destroy the existing chart
  // before rendering a new one.
  let expenseChart = null;

  // Current Firestore listener unsubscribe function.  When the selected
  // period changes, the previous listener is cleaned up to avoid memory
  // leaks.
  let unsubscribeListener = null;

  // Application state for selected month/year.
  const state = {
    selectedMonth: null,
    selectedYear: null
  };

  /**
   * Format a number as currency (Israeli Shekel).  We use the Hebrew
   * locale here to properly display thousands separators and the correct
   * currency symbol.  See Intl.NumberFormat documentation for details.
   *
   * @param {number} amount
   * @returns {string}
   */
  function formatCurrency(amount) {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
  }

  /**
   * Populate the month selector with the 12 months of the year.  The
   * selector values are numeric (1–12) and the labels are English month
   * names for readability.
   */
  function populateMonthSelect() {
    const months = [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' }
    ];
    monthSelect.innerHTML = '';
    months.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      monthSelect.appendChild(option);
    });
  }

  /**
   * Populate the year selector starting from 2024 up to the current year.  If
   * transactions exist from earlier years you can adjust the start year.  The
   * list is built in reverse order (current to oldest) to place the most
   * recent year at the top.
   */
  function populateYearSelect() {
    const currentYear = new Date().getFullYear();
    const startYear = 2024;
    yearSelect.innerHTML = '';
    for (let y = currentYear; y >= startYear; y--) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = y;
      yearSelect.appendChild(option);
    }
  }
  
/**
 * 
 * function by chatgpt that gets
 * the selected type from the radio buttons
 */
  function getSelectedType() {
  const checked = typeSelect.querySelector('input[type="radio"]:checked');
  return checked ? checked.value : '';
}

  /**
   * Populate the analysis month selector inside the analytics modal.  Uses
   * the same month list as the main period selector.
   */
  function populateAnalysisMonthSelect() {
    const months = [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' }
    ];
    analysisMonthSelect.innerHTML = '';
    months.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      analysisMonthSelect.appendChild(option);
    });
  }

  /**
   * Populate the analysis year selector inside the analytics modal.  Starts
   * from 2024 up to the current year, similar to populateYearSelect().
   */
  function populateAnalysisYearSelect() {
    const currentYear = new Date().getFullYear();
    const startYear = 2024;
    analysisYearSelect.innerHTML = '';
    for (let y = currentYear; y >= startYear; y--) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = y;
      analysisYearSelect.appendChild(option);
    }
  }

  /**
   * Update the analytics data and UI based on a selected base month/year.  If
   * no arguments are provided, defaults to the current period.  This
   * function fetches the three-month summary and expense category
   * aggregation, then renders the comparison cards and chart.
   *
   * @param {number} [month]
   * @param {number} [year]
   */
  async function updateAnalytics(month, year) {
    const comparisonData = await fetchThreeMonthData(month, year);
    renderComparisonCards(comparisonData);
    const categoryData = await aggregateExpensesByCategory(month, year);
    renderExpenseTrendsChart(categoryData);
  }

  /**
   * Populate the category selector based on the selected transaction type.
   * When the type is 'Income' we present income categories; for 'Expense'
   * we show expense categories.  A disabled placeholder is included at the
   * top so the select cannot default to an invalid value.
   *
   * @param {string} type
   */
  function populateKindSelect(type) {
    const categories = type === 'Income' ? incomeCategories : expenseCategories;
    kindSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Select category';
    kindSelect.appendChild(placeholder);
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      kindSelect.appendChild(option);
    });
  }

  /**
   * Validate the transaction form.  A transaction is valid when all fields
   * have values and the amount is a positive number.  This function also
   * toggles the submit button's disabled state accordingly.
   *
   * @returns {boolean}
   */
  function validateForm() {
  // For radio group, get checked input value
  let nameVal = '';
  const nameChecked = nameSelect.querySelector('input[type="radio"]:checked');
  if (nameChecked) nameVal = nameChecked.value;
  let typeVal = '';
  const typeChecked = typeSelect.querySelector('input[type="radio"]:checked');
  if (typeChecked) typeVal = typeChecked.value;
  const kindVal = kindSelect.value;
  const amountVal = parseFloat(amountInput.value);
  const valid = nameVal && typeVal && kindVal && !isNaN(amountVal) && amountVal > 0;
  submitButton.disabled = !valid;
  return valid;
  }

  /**
   * Render the transaction list table and update the overview totals.  This
   * function receives an array of transaction objects (from Firestore
   * snapshots) and builds table rows.  It also calculates totals per user
   * and overall for both expenses and incomes.
   *
   * @param {Array<Object>} transactions
   */
  function renderTransactions(transactions) {
    transactionsTableBody.innerHTML = '';
    if (!transactions || transactions.length === 0) {
      noTransactionsMessage.classList.remove('hidden');
    } else {
      noTransactionsMessage.classList.add('hidden');
    }
    // Initialize totals
    const totals = {
      expenses: { nir: 0, dana: 0, total: 0 },
      incomes: { nir: 0, dana: 0, total: 0 }
    };
    transactions.forEach(tx => {
      const row = document.createElement('tr');
      // Format timestamp: Firestore timestamps need to be converted to Date
      const dateObj = tx.timestamp instanceof Date ? tx.timestamp : tx.timestamp.toDate();
      const dateStr = dateObj.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const user = tx.name;
      const type = tx.type;
      const kind = tx.kind;
      const amountNum = Number(tx.amount);
      const formattedAmt = formatCurrency(amountNum);
      // Update totals
      const userKey = user.toLowerCase();
      if (type === 'Expense') {
        totals.expenses[userKey] += Math.abs(amountNum);
        totals.expenses.total += Math.abs(amountNum);
      } else {
        totals.incomes[userKey] += amountNum;
        totals.incomes.total += amountNum;
      }
      [dateStr, user, type, kind, formattedAmt].forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        // Add classes to amount column for styling
        if (index === 4) {
          if (type === 'Expense') {
            cell.classList.add('expense-amount');
            if (Math.abs(amountNum) > 1000) {
              cell.style.fontWeight = 'bold';
            }
          } else {
            cell.classList.add('income-amount');
          }
        }
        row.appendChild(cell);
      });
      transactionsTableBody.appendChild(row);
    });
    // Update overview totals
    nirExpenseEl.textContent = formatCurrency(totals.expenses.nir);
    danaExpenseEl.textContent = formatCurrency(totals.expenses.dana);
    totalExpenseEl.textContent = formatCurrency(totals.expenses.total);
    nirIncomeEl.textContent = formatCurrency(totals.incomes.nir);
    danaIncomeEl.textContent = formatCurrency(totals.incomes.dana);
    totalIncomeEl.textContent = formatCurrency(totals.incomes.total);
  }

  /**
   * Set up a Firestore real-time listener for transactions in a specific
   * month/year.  When the data changes (added/modified/removed), the
   * onSnapshot callback receives the latest data.  We sort by descending
   * timestamp to put the newest transactions at the top.
   *
   * @param {number} month
   * @param {number} year
   */
  function listenToTransactions(month, year) {
    // Unsubscribe previous listener if it exists
    if (typeof unsubscribeListener === 'function') {
      unsubscribeListener();
    }
    const txRef = collection(db, 'transactions');
    const q = query(
      txRef,
      where('month', '==', month),
      where('year', '==', year),
      orderBy('timestamp', 'desc')
    );
    unsubscribeListener = onSnapshot(q, snapshot => {
      const docs = snapshot.docs.map(doc => doc.data());
      renderTransactions(docs);
    });
  }

  /**
   * Handle changes to the month or year selectors.  Update the global state,
   * current period label and Firestore listener accordingly.
   */
  function handlePeriodChange() {
    const month = parseInt(monthSelect.value, 10);
    const year = parseInt(yearSelect.value, 10);
    state.selectedMonth = month;
    state.selectedYear = year;
    // Update header label with selected period
    const monthLabel = monthSelect.options[monthSelect.selectedIndex].textContent;
    currentPeriodEl.textContent = `${monthLabel} ${year}`;
    // Refresh listener
    listenToTransactions(month, year);
  }

  /**
   * Initialize the period selectors to the current month and year when a
   * user logs in.  This ensures that the dashboard defaults to the most
   * recent period.
   */
  function initializePeriod() {
    const now = new Date();
    state.selectedMonth = now.getMonth() + 1;
    state.selectedYear = now.getFullYear();
    monthSelect.value = state.selectedMonth;
    yearSelect.value = state.selectedYear;
  handlePeriodChange(); // This will not trigger Firestore now
  }

  /**
   * Perform Google sign-in via a pop‑up.  After a successful sign‑in the
   * user's email is checked against the whitelist.  Unauthorized users are
   * immediately signed out and shown an error message.  Any sign‑in
   * exception is displayed to the user.
   */
  async function doLogin() {
    loginError.textContent = '';
    loginError.classList.add('hidden');
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      if (user && user.email) {
        const emailLower = user.email.toLowerCase();
        if (!EMAIL_WHITELIST.includes(emailLower)) {
          // Not authorized: sign the user out and show an error
          await signOut(auth);
          loginError.textContent = 'Access denied: your account is not authorized for this application.';
          loginError.classList.remove('hidden');
        }
      }
    } catch (error) {
      loginError.textContent = `Sign‑in failed: ${error.message}`;
      loginError.classList.remove('hidden');
      console.error('Login error', error);
    }
  }

  /**
   * Monitor authentication state changes.  When the user is authorized,
   * hide the login screen, show the app, initialize selectors and attach
   * listeners.  When the user is signed out (or unauthorized), revert to
   * the login screen and clean up any Firestore listeners.
   */
  function setupAuthListener() {
        // Initialize selectors
        populateMonthSelect();
        populateYearSelect();
        const checkedType = typeSelect.querySelector('input[type="radio"]:checked');
        populateKindSelect(checkedType ? checkedType.value : '');
        initializePeriod();
    onAuthStateChanged(auth, user => {
      if (user && user.email && EMAIL_WHITELIST.includes(user.email.toLowerCase())) {
        // Authorized user: show app
        loginSection.classList.add('hidden');
        appContainer.classList.remove('hidden');
        userNameSpan.textContent = user.displayName || user.email;
        // Initialize selectors
        populateMonthSelect();
        populateYearSelect();
        const checkedType = typeSelect.querySelector('input[type="radio"]:checked');
        populateKindSelect(checkedType ? checkedType.value : '');
        initializePeriod();
        // Ensure analytics modal is closed on login
        analyticsModal.classList.add('hidden');
      } else {
        // Not logged in or unauthorized
        appContainer.classList.add('hidden');
        loginSection.classList.remove('hidden');
        userNameSpan.textContent = '';
        // Unsubscribe Firestore listener if present
        if (typeof unsubscribeListener === 'function') {
          unsubscribeListener();
          unsubscribeListener = null;
        }
        // Ensure analytics modal is closed on logout
        analyticsModal.classList.add('hidden');
      }
    });
  }

  /**
   * Sign the current user out of Firebase.
   */
  async function doLogout() {
    await signOut(auth);
  }

  /**
   * Submit the transaction form.  Validates input, prepares the data and
   * writes it to Firestore.  Expenses are stored as negative values while
   * incomes are positive, making it easier to perform aggregations later.
   * After submission the form is reset and a success message is shown.
   *
   * @param {Event} event
   */
  async function submitTransaction(event) {
    event.preventDefault();
    // Get values from radio groups
    let nameVal = '';
    const nameChecked = nameSelect.querySelector('input[type="radio"]:checked');
    if (nameChecked) nameVal = nameChecked.value;
    let typeVal = '';
    const typeChecked = typeSelect.querySelector('input[type="radio"]:checked');
    if (typeChecked) typeVal = typeChecked.value;
    const kindVal = kindSelect.value;
    const amountVal = parseFloat(amountInput.value);
    if (!(nameVal && typeVal && kindVal && !isNaN(amountVal) && amountVal > 0)) {
      formError.textContent = 'Please fill out all fields correctly.';
      formError.classList.remove('hidden');
      return;
    }
    formError.classList.add('hidden');
    // Prepare transaction data
    const tx = {
      name: nameVal,
      type: typeVal,
      kind: kindVal,
      amount: typeVal === 'Expense' ? -Math.abs(amountVal) : Math.abs(amountVal),
      month: state.selectedMonth,
      year: state.selectedYear,
      timestamp: new Date()
    };
    try {
      await addDoc(collection(db, 'transactions'), tx);
      transactionForm.reset();
      submitButton.disabled = true;
      formSuccess.textContent = 'Transaction added!';
      formSuccess.classList.remove('hidden');
      setTimeout(() => formSuccess.classList.add('hidden'), 2000);
    } catch (err) {
      formError.textContent = 'Failed to add transaction.';
      formError.classList.remove('hidden');
    }
  }

  /**
   * Aggregate expenses by category for the last three months.  Only
   * transactions of type 'Expense' are included.  The returned object maps
   * category names to per‑user totals, e.g. { 'Groceries': { nir: 100, dana: 50 } }.
   *
   * @returns {Promise<Object<string,{nir:number,dana:number}>>}
   */
  /**
   * Aggregate expenses by category over three consecutive months ending at
   * a specified month/year.  Includes categories with zero totals so
   * charts always display all categories.  If no base period is provided,
   * the current month/year are used.
   *
   * @param {number} [baseMonth]
   * @param {number} [baseYear]
   * @returns {Promise<Object<string,{nir:number,dana:number}>>}
   */
  async function aggregateExpensesByCategory(baseMonth, baseYear) {
    const now = new Date();
    const startMonth = typeof baseMonth === 'number' ? baseMonth : now.getMonth() + 1;
    const startYear = typeof baseYear === 'number' ? baseYear : now.getFullYear();
    const periods = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(startYear, startMonth - 1 - i, 1);
      periods.push({ month: date.getMonth() + 1, year: date.getFullYear() });
    }
    // Initialize all expense categories with zero totals
    const categoryMap = {};
    expenseCategories.forEach(cat => {
      categoryMap[cat] = { nir: 0, dana: 0 };
    });
    for (const p of periods) {
      const txRef = collection(db, 'transactions');
      const q = query(
        txRef,
        where('month', '==', p.month),
        where('year', '==', p.year),
        where('type', '==', 'Expense')
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const userKey = data.name.toLowerCase();
        const amt = Math.abs(Number(data.amount));
        const cat = data.kind;
        if (!categoryMap[cat]) {
          categoryMap[cat] = { nir: 0, dana: 0 };
        }
        categoryMap[cat][userKey] += amt;
      });
    }
    return categoryMap;
  }

  /**
   * Render comparison cards given three‑month data.  Each card displays
   * income, expenses and net income for a particular month.
   *
   * @param {Array<Object>} data
   */
  function renderComparisonCards(data) {
    comparisonCardsContainer.innerHTML = '';
    data.forEach(item => {
      const card = document.createElement('div');
      card.classList.add('comparison-card');
      card.innerHTML = `
        <h4>${item.label}</h4>
        <div class="amount">Income: ${formatCurrency(item.totalIncome)}</div>
        <div class="amount">Expenses: ${formatCurrency(item.totalExpenses)}</div>
        <div class="amount">Net: ${formatCurrency(item.net)}</div>
      `;
      comparisonCardsContainer.appendChild(card);
    });
  }

  /**
   * Helper functions to derive CSS custom property values and convert them
   * into RGBA values with a specified opacity.  Chart.js accepts RGBA
   * strings for colors.
   */
  function varPrimaryColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
  }
  function varSecondaryColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim();
  }
  function transparentize(color, opacity) {
    if (color.startsWith('#')) {
      const bigint = parseInt(color.slice(1), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }

  /**
   * Render the expense trends chart.  The chart shows expense totals by
   * category for each user, using Chart.js.  If a chart already exists
   * it is destroyed before rendering a new one.
   *
   * @param {Object} categoryMap
   */
  function renderExpenseTrendsChart(categoryMap) {
    const categories = Object.keys(categoryMap);
    const nirData = [];
    const danaData = [];
    categories.forEach(cat => {
      nirData.push(categoryMap[cat].nir);
      danaData.push(categoryMap[cat].dana);
    });
    const dataConfig = {
      labels: categories,
      datasets: [
        {
          label: 'Nir',
          data: nirData,
          borderColor: varPrimaryColor(),
          backgroundColor: transparentize(varPrimaryColor(), 0.1)
        },
        {
          label: 'Dana',
          data: danaData,
          borderColor: varSecondaryColor(),
          backgroundColor: transparentize(varSecondaryColor(), 0.1)
        }
      ]
    };
    const config = {
      type: 'bar',
      data: dataConfig,
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Amount (₪)' }
          },
          x: {
            title: { display: true, text: 'Category' }
          }
        }
      }
    };
    if (expenseChart) {
      expenseChart.destroy();
    }
    expenseChart = new Chart(expenseTrendsCanvas, config);
  }

  /**
   * Open the analytics modal.  This function retrieves the required data
   * asynchronously, renders the comparison cards and chart, and then
   * reveals the modal overlay.
   */
  async function openAnalytics() {
    // Show the modal
    analyticsModal.classList.remove('hidden');
    // Populate selectors for analysis period
    populateAnalysisMonthSelect();
    populateAnalysisYearSelect();
    // Set default values based on current selected period from main dashboard
    const now = new Date();
    const defaultMonth = state.selectedMonth || now.getMonth() + 1;
    const defaultYear = state.selectedYear || now.getFullYear();
    analysisMonthSelect.value = defaultMonth;
    analysisYearSelect.value = defaultYear;
    // Fetch and render analytics for the default period
    updateAnalytics(parseInt(analysisMonthSelect.value, 10), parseInt(analysisYearSelect.value, 10));
  }

  /**
   * Close the analytics modal.
   */
  function closeAnalytics(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    analyticsModal.classList.add('hidden');
  }

  /**
   * Attach event listeners to the UI elements.  Each listener delegates
   * to the appropriate handler.
   */
  function attachEventListeners() {
    loginButton.addEventListener('click', doLogin);
    logoutButton.addEventListener('click', doLogout);
    typeSelect.addEventListener('change', () => {
      populateKindSelect(getSelectedType());
      validateForm();
      });
    const typeRadios = typeSelect.querySelectorAll('input[type="radio"]');
    typeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        populateKindSelect(getSelectedType());
        validateForm();
      });
    });
    nameSelect.addEventListener('change', validateForm);
    kindSelect.addEventListener('change', validateForm);
    amountInput.addEventListener('input', validateForm);
    transactionForm.addEventListener('submit', submitTransaction);
    monthSelect.addEventListener('change', handlePeriodChange);
    yearSelect.addEventListener('change', handlePeriodChange);
    // Remove any existing listeners before adding new ones
    openAnalyticsBtn.removeEventListener('click', openAnalytics);
    closeAnalyticsBtn.removeEventListener('click', closeAnalytics);
    analyticsModal.removeEventListener('click', closeAnalytics);
    
    // Add fresh event listeners
    openAnalyticsBtn.addEventListener('click', (e) => {
      openAnalytics(e);
    });
    closeAnalyticsBtn.addEventListener('click', closeAnalytics);
    
    // Dismiss modal when clicking outside of the content
    analyticsModal.addEventListener('click', e => {
      if (e.target === analyticsModal) {
        closeAnalytics();
      }
    });

    // Update analytics when period selectors inside modal change
    analysisMonthSelect.addEventListener('change', () => {
      const m = parseInt(analysisMonthSelect.value, 10);
      const y = parseInt(analysisYearSelect.value, 10);
      updateAnalytics(m, y);
    });
    analysisYearSelect.addEventListener('change', () => {
      const m = parseInt(analysisMonthSelect.value, 10);
      const y = parseInt(analysisYearSelect.value, 10);
      updateAnalytics(m, y);
    });
  }

  /**
   * Initialization entry point.  Sets up event listeners and starts the
   * authentication observer.  Called once on DOMContentLoaded.
   */
  function init() {
    attachEventListeners();
    setupAuthListener();
  }

  document.addEventListener('DOMContentLoaded', init);
})();