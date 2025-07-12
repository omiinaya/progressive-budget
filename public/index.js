/**
 * Progressive Budget Tracker Frontend
 * Modern, modular, accessible, and performant
 */

let transactions = [];
let myChart;

// Utility: Get element by selector
const $ = (selector) => document.querySelector(selector);

// Fetch transactions and initialize UI
async function fetchTransactions() {
  try {
    const response = await fetch('/api/transaction');
    if (!response.ok) throw new Error('Failed to fetch transactions');
    transactions = await response.json();
    updateUI();
  } catch (error) {
    showError('Unable to load transactions. Please try again later.');
    console.error(error);
  }
}

// Update all UI components
function updateUI() {
  populateTotal();
  populateTable();
  populateChart();
}

// Show error message and set ARIA live
function showError(message) {
  const errorEl = $('#error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.style.display = 'block';
    errorEl.focus && errorEl.focus();
  }
}

// Hide error message
function hideError() {
  const errorEl = $('#error-message');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
}

// Populate total balance
function populateTotal() {
  const total = transactions.reduce((sum, t) => sum + Number(t.value), 0);
  const totalEl = $('#total');
  if (totalEl) totalEl.textContent = total.toLocaleString();
}

// Populate transaction table
function populateTable() {
  const tbody = $('#tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  transactions.forEach((transaction) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(transaction.name)}</td>
      <td>${Number(transaction.value).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Escape HTML for safe rendering
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
}

// Populate chart with Chart.js
function populateChart() {
  const reversed = transactions.slice().reverse();
  let sum = 0;
  const labels = reversed.map(t => {
    const date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });
  const data = reversed.map(t => {
    sum += Number(t.value);
    return sum;
  });
  if (myChart) myChart.destroy();
  const ctx = $('#my-chart')?.getContext('2d');
  if (!ctx) return;
  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Over Time',
        fill: true,
        backgroundColor: '#317EFB33',
        borderColor: '#317EFB',
        data,
        tension: 0.3,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// Handle transaction form submission
async function sendTransaction(isAdding) {
  const nameEl = $('#t-name');
  const amountEl = $('#t-amount');
  hideError();
  if (!nameEl.value.trim() || !amountEl.value.trim()) {
    showError('Missing Information');
    nameEl.focus();
    return;
  }
  const transaction = {
    name: nameEl.value.trim(),
    value: isAdding ? Math.abs(Number(amountEl.value)) : -Math.abs(Number(amountEl.value)),
    date: new Date().toISOString()
  };
  transactions.unshift(transaction);
  updateUI();
  try {
    const response = await fetch('/api/transaction', {
      method: 'POST',
      body: JSON.stringify(transaction),
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (data.errors) {
      showError('Missing Information');
    } else {
      nameEl.value = '';
      amountEl.value = '';
      nameEl.focus();
    }
  } catch (err) {
    // Save to IndexedDB if offline
    saveRecord(transaction);
    nameEl.value = '';
    amountEl.value = '';
    nameEl.focus();
    showError('Offline: Transaction will sync when online.');
  }
}

// Event listeners
$('#add-btn')?.addEventListener('click', (event) => {
  event.preventDefault();
  sendTransaction(true);
});
$('#sub-btn')?.addEventListener('click', (event) => {
  event.preventDefault();
  sendTransaction(false);
});
$('#del-btn')?.addEventListener('click', (event) => {
  event.preventDefault();
  deletePending();
  showError('Pending transactions cleared.');
  setTimeout(hideError, 2000);
});

// Accessibility: focus on error
$('#error-message')?.addEventListener('DOMSubtreeModified', function() {
  if (this.textContent) this.focus();
});

// Initial load
window.addEventListener('DOMContentLoaded', fetchTransactions);
