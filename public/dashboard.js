document.addEventListener('DOMContentLoaded', async () => {
    // Get user data from localStorage
    const telegramId = localStorage.getItem('telegramId');
    if (!telegramId) {
        window.location.href = '/';
        return;
    }

    // Elements
    const profilePic = document.getElementById('profilePic');
    const username = document.getElementById('username');
    const telegramIdDisplay = document.getElementById('telegramId');
    const balanceDisplay = document.getElementById('balance');
    const recentTransactions = document.getElementById('recentTransactions');
    const successModal = document.getElementById('successModal');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');

    // Fetch user data
    async function fetchUserData() {
        try {
            const response = await fetch('/getUserData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId })
            });

            const data = await response.json();
            
            if (data.success) {
                // Update profile information
                username.textContent = data.userData.username || 'Anonymous';
                telegramIdDisplay.textContent = `ID: ${telegramId}`;
                balanceDisplay.textContent = `$${parseFloat(data.userData.balance).toFixed(2)}`;
                
                // Update profile picture if available
                if (data.userData.photo_url) {
                    profilePic.src = data.userData.photo_url;
                    profilePic.onerror = () => {
                        profilePic.src = 'https://via.placeholder.com/100';
                    };
                }

                // Update transactions
                updateTransactionHistory(data.userData.transactions);
            } else {
                showError('Failed to load user data');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            showError('Failed to connect to server');
        }
    }

    // Show success modal
    window.showSuccessModal = function(title, message) {
        successTitle.textContent = title;
        successMessage.textContent = message;
        successModal.classList.remove('hidden');
    }

    // Close success modal
    window.closeSuccessModal = function() {
        successModal.classList.add('hidden');
    }

    // Logout function
    window.logout = function() {
        localStorage.removeItem('telegramId');
        window.location.href = '/';
    }

    // Modal functions
    window.showModal = function(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Send money function
    window.sendMoney = async function() {
        const recipientId = document.getElementById('recipientId').value;
        const amount = parseFloat(document.getElementById('sendAmount').value);

        if (!recipientId || !amount || amount <= 0) {
            showError('Please enter valid recipient ID and amount');
            return;
        }

        try {
            const response = await fetch('/sendMoney', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderId: telegramId,
                    receiverId: recipientId,
                    amount: amount
                })
            });

            const data = await response.json();
            
            if (data.success) {
                closeModal('sendMoneyModal');
                showSuccessModal('Transfer Successful!', `$${amount.toFixed(2)} has been sent to ID: ${recipientId}`);
                document.getElementById('recipientId').value = '';
                document.getElementById('sendAmount').value = '';
                fetchUserData(); // Refresh data
            } else {
                showError(data.error || 'Transfer failed');
            }
        } catch (error) {
            console.error('Error sending money:', error);
            showError('Failed to send money');
        }
    }

    // Record purchase function
    window.recordPurchase = async function() {
        const amount = parseFloat(document.getElementById('purchaseAmount').value);
        const description = document.getElementById('purchaseDescription').value;

        if (!amount || amount <= 0 || !description) {
            showError('Please enter valid amount and description');
            return;
        }

        try {
            const response = await fetch('/recordPurchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: telegramId,
                    amount: amount,
                    description: description
                })
            });

            const data = await response.json();
            
            if (data.success) {
                closeModal('purchaseModal');
                showSuccessModal('Purchase Recorded!', `$${amount.toFixed(2)} - ${description}`);
                document.getElementById('purchaseAmount').value = '';
                document.getElementById('purchaseDescription').value = '';
                fetchUserData(); // Refresh data
            } else {
                showError(data.error || 'Failed to record purchase');
            }
        } catch (error) {
            console.error('Error recording purchase:', error);
            showError('Failed to record purchase');
        }
    }

    // Update transaction history
    function updateTransactionHistory(transactions) {
        recentTransactions.innerHTML = '';
        
        if (!transactions || transactions.length === 0) {
            recentTransactions.innerHTML = '<p class="text-gray-400 text-center">No transactions yet</p>';
            return;
        }

        transactions.forEach(transaction => {
            const isOutgoing = transaction.sender_id === telegramId;
            const amount = parseFloat(transaction.amount).toFixed(2);
            const formattedAmount = isOutgoing ? `-$${amount}` : `+$${amount}`;
            const amountClass = isOutgoing ? 'text-red-500' : 'text-green-500';
            
            const transactionHtml = `
                <div class="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                    <div class="flex items-center space-x-4">
                        <div class="w-10 h-10 ${isOutgoing ? 'bg-red-500' : 'bg-green-500'} rounded-full flex items-center justify-center">
                            <i class="fas fa-arrow-${isOutgoing ? 'up' : 'down'} text-white"></i>
                        </div>
                        <div>
                            <h4 class="font-semibold">${transaction.type === 'purchase' ? 'Purchase' : isOutgoing ? 'Sent Payment' : 'Received Payment'}</h4>
                            <p class="text-sm text-gray-400">
                                ${transaction.type === 'purchase' 
                                    ? transaction.description 
                                    : isOutgoing 
                                        ? `To: ${transaction.receiver_username || 'Unknown'}`
                                        : `From: ${transaction.sender_username || 'Unknown'}`}
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold ${amountClass}">${formattedAmount}</p>
                        <p class="text-sm text-gray-400">${formatRelativeTime(new Date(transaction.created_at))}</p>
                    </div>
                </div>
            `;
            recentTransactions.innerHTML += transactionHtml;
        });
    }

    // Helper functions
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg z-50';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    function formatRelativeTime(date) {
        const now = new Date();
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        if (diffInHours < 1) return 'Just now';
        if (diffInHours === 1) return '1 hour ago';
        if (diffInHours < 24) return `${diffInHours} hours ago`;
        return `${Math.floor(diffInHours / 24)} days ago`;
    }

    // Initial data fetch
    fetchUserData();

    // Refresh data every 30 seconds
    setInterval(fetchUserData, 30000);
});