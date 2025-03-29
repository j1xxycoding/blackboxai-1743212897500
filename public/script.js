document.addEventListener('DOMContentLoaded', () => {
    const telegramIdInput = document.querySelector('input[placeholder="Enter your Telegram ID"]');
    const otpInput = document.querySelector('input[placeholder="Enter OTP"]');
    const sendOTPButton = document.getElementById('sendOTP');
    const loginButton = document.getElementById('login');

    // Function to show message
    function showMessage(text, isError = false) {
        // Remove any existing message
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-4 rounded-lg mt-4 ${isError ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`;
        messageDiv.textContent = text;
        
        // Insert after the login button
        loginButton.parentNode.insertBefore(messageDiv, loginButton.nextSibling);

        // Auto remove after 5 seconds
        setTimeout(() => messageDiv.remove(), 5000);
    }

    // Send OTP
    sendOTPButton.addEventListener('click', async () => {
        const telegramId = telegramIdInput.value.trim();
        
        if (!telegramId) {
            showMessage('Please enter your Telegram ID', true);
            return;
        }

        try {
            sendOTPButton.disabled = true;
            sendOTPButton.textContent = 'Sending...';
            
            const response = await fetch('/sendOTP', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ telegramId })
            });

            const data = await response.json();
            
            if (data.success) {
                showMessage('OTP sent successfully! Check your Telegram messages.');
                otpInput.classList.remove('hidden');
                loginButton.classList.remove('hidden');
                otpInput.focus();
            } else {
                showMessage(data.error || 'Failed to send OTP', true);
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Failed to connect to server', true);
        } finally {
            sendOTPButton.disabled = false;
            sendOTPButton.textContent = 'Send OTP';
        }
    });

    // Verify OTP
    loginButton.addEventListener('click', async () => {
        const telegramId = telegramIdInput.value.trim();
        const otp = otpInput.value.trim();
        
        if (!telegramId || !otp) {
            showMessage('Please enter both Telegram ID and OTP', true);
            return;
        }

        try {
            loginButton.disabled = true;
            loginButton.textContent = 'Verifying...';
            
            const response = await fetch('/verifyOTP', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ telegramId, otp })
            });

            const data = await response.json();
            
            if (data.success) {
                showMessage('Login successful!');
                localStorage.setItem('telegramId', telegramId);
                
                // Redirect after showing success message
                setTimeout(() => {
                    window.location.href = data.redirect;
                }, 1000);
            } else {
                showMessage(data.error || 'Invalid OTP', true);
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Failed to connect to server', true);
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    });

    // Input validation
    telegramIdInput.addEventListener('input', (e) => {
        // Remove any non-numeric characters
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    otpInput.addEventListener('input', (e) => {
        // Remove any non-numeric characters and limit to 6 digits
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
});