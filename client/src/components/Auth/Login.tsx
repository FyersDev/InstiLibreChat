import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useToastContext } from '@librechat/client';
import type { TLoginLayoutContext } from '~/common';

function Login() {
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const companyName =
    startupConfig?.appTitle || 'FIA - FYERS Intelligent Assistant';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      showToast({
        message: 'Please enter a valid email address',
        status: 'error',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.error === 'UNAUTHORIZED') {
          showToast({
            message:
              'Access Denied: Only super admins and organization admins can login via OTP. Please contact your administrator.',
            status: 'error',
          });
        } else if (response.status === 404 && data.error === 'USER_NOT_FOUND') {
          showToast({
            message: 'User not found. Please check your email address.',
            status: 'error',
          });
        } else {
          showToast({
            message: data.message || 'Failed to send OTP',
            status: 'error',
          });
        }

        setIsLoading(false);
        return;
      }

      navigate(`/login/otp?email=${encodeURIComponent(email)}`);
    } catch (error) {
      console.error('Error sending OTP:', error);
      showToast({
        message: 'Failed to send OTP. Please try again.',
        status: 'error',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
{/* ================= LEFT SECTION ================= */}
<div className="flex-1 bg-[#F0F0FA] p-6 sm:p-8 lg:p-12 flex flex-col min-h-[40vh] lg:min-h-screen">
  
  {/* Logo - ALWAYS AT TOP */}
  <div className="flex items-center gap-2 sm:gap-3">
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center p-1 flex-shrink-0">
      <img
        src="/assets/Logo.svg"
        alt="FIA Logo"
        className="w-full h-full object-contain"
      />
    </div>
    <span className="text-gray-900 text-2xl sm:text-2xl font-bold lg:text-4xl font-large">
      FYERS
    </span>
  </div>

  {/* CENTER CONTENT (HEADER + IMAGE) */}
  <div className="flex flex-1 flex-col justify-center">
    {/* Heading */}
    <h1 className="text-gray-900 text-2xl sm:text-3xl lg:text-5xl font-bold leading-tight mb-8 lg:mb-12 max-w-3xl">
      Experience the FYERS Intelligent Assistant
    </h1>

    {/* FYERS Illustration */}
    <div className="flex justify-start">
      <img
        src="/assets/fyers-login-illustration.png"
        alt="FYERS platform preview"
        className="w-full max-w-[900px] h-[260px] sm:h-[320px] lg:h-[420px] object-contain"

      />
    </div>
  </div>
</div>


      {/* ================= RIGHT SECTION ================= */}
      <div className="w-full lg:w-[480px] flex items-center justify-left p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 lg:p-10 text-left">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Login to FIA
          </h2>
          <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
            {companyName}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2434E7] text-base"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className={`w-full py-3 rounded-lg font-medium transition text-base ${
                isLoading || !email
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#2434E7] text-white hover:bg-[#1a28b8]'
              }`}
            >
              {isLoading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
