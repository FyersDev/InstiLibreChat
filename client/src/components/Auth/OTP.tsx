import { useState } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import {
  TrendingUp,
  Shield,
  Users,
  FileText,
  MessageSquare,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import type { TLoginLayoutContext } from '~/common';

function OTP() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToastContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();

  const email = searchParams.get('email') || '';
  const companyName =
    startupConfig?.appTitle || 'FIA - FYERS Intelligent Assistant.';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      if (value && index < 5) {
        setTimeout(() => {
          const nextInput = document.getElementById(`otp-${index + 1}`);
          if (nextInput) nextInput.focus();
        }, 10);
      }
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) prevInput.focus();
    }

    if (e.key === 'Enter') {
      const otpValue = otp.join('');
      if (otpValue.length === 6 && !isLoading) {
        e.preventDefault();
        handleLogin();
      }
    }
  };

  const handleLogin = async () => {
    const otpValue = otp.join('');

    if (otpValue.length !== 6) {
      showToast({
        message: 'Please enter complete OTP',
        status: 'error',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpValue }),
        credentials: 'include',
      });

      const responseData = await response.json();

      if (!response.ok) {
        showToast({
          message: responseData.message || 'Invalid OTP',
          status: 'error',
        });
        setIsLoading(false);
        return;
      }

      const data = responseData.data || responseData;

      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        const userData = data.user || data;
        localStorage.setItem('user', JSON.stringify(userData));

        if (data.permissions) {
          localStorage.setItem(
            'permissions',
            JSON.stringify(data.permissions)
          );
        }

        const isSuperAdmin = userData.is_super_admin === true;
        const orgRole = userData.org_role || userData.orgRole;
        const canAccessAdmin = isSuperAdmin || orgRole === 'admin';

        localStorage.setItem(
          'canAccessAdmin',
          JSON.stringify(canAccessAdmin)
        );

        try {
          const proxyLoginPayload: any = {
            email: userData.email || email,
          };

          if (data.refresh_token?.trim()) {
            proxyLoginPayload.refresh_token = data.refresh_token;
          }

          const proxyLoginResponse = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyLoginPayload),
            credentials: 'include',
          });

          if (!proxyLoginResponse.ok) {
            const errorText = await proxyLoginResponse.text();
            showToast({
              message:
                errorText ||
                'Failed to sync with FIA. Please try again.',
              status: 'error',
            });
            setIsLoading(false);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
          window.location.href = '/c/new';
          return;
        } catch {
          showToast({
            message: 'Failed to connect to FIA. Please try again.',
            status: 'error',
          });
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(false);
    } catch {
      showToast({
        message: 'Failed to verify OTP. Please try again.',
        status: 'error',
      });
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setOtp(['', '', '', '', '', '']);

    try {
      const response = await fetch('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        showToast({
          message: data.message || 'Failed to resend OTP',
          status: 'error',
        });
        setIsResending(false);
        return;
      }

      showToast({
        message: 'OTP resent to your email',
        status: 'success',
      });
    } catch {
      showToast({
        message: 'Failed to resend OTP. Please try again.',
        status: 'error',
      });
    } finally {
      setIsResending(false);
    }
  };

  if (!email) {
    navigate('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ================= LEFT SECTION ================= */}
      <div className="flex-1 bg-[#F0F0FA] p-6 sm:p-8 lg:p-12 flex flex-col min-h-[40vh] lg:min-h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center p-1">
            <img
              src="/assets/Logo.svg"
              alt="FIA Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-gray-900 text-base sm:text-lg lg:text-xl font-medium">
            FIA - FYERS Intelligent Assistant
          </span>
        </div>

        {/* Center Content */}
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-gray-900 text-2xl sm:text-3xl lg:text-5xl font-bold leading-tight mb-8 lg:mb-12 max-w-3xl">
            Experience the all-new FYERS!
          </h1>

          <img
            src="/assets/fyers-login-illustration.png"
            alt="FYERS platform preview"
            className="w-full max-w-[900px] h-[260px] sm:h-[320px] lg:h-[420px] object-contain"
          />
        </div>
      </div>

      {/* ================= RIGHT SECTION (UNCHANGED) ================= */}
      <div className="bg-white flex items-start lg:items-center justify-center px-6">
        <div className="w-full max-w-md flex flex-col">
          <button
            onClick={() => navigate('/login')}
            className="mb-4 flex items-center gap-2 text-gray-700 hover:text-gray-900 transition self-start"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-base font-medium">Back</span>
          </button>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 sm:p-8 lg:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Login to FIA
            </h2>
            <p className="text-gray-600 mb-2 text-sm sm:text-base">
              {companyName}
            </p>
            <p className="text-xs sm:text-sm text-gray-500 mb-6 break-all">
              OTP sent to: {email}
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-3">
              Enter OTP
            </label>

            <div className="flex gap-2 sm:gap-3 mb-6">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoComplete='off'
                  autoSave='off'
                  autoCorrect='off'
                  onChange={(e) =>
                    handleOtpChange(index, e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-gray-300 rounded-lg text-center text-base font-semibold focus:border-[#2434E7] focus:outline-none"
                />
              ))}
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading || otp.join('').length !== 6}
              className="w-full bg-[#2434E7] text-white font-semibold py-3 rounded-lg hover:bg-[#1a28b8] transition mb-4 disabled:bg-gray-400"
            >
              {isLoading ? 'Verifying...' : 'Login'}
            </button>

            <button
              onClick={handleResend}
              disabled={isResending}
              className="w-full border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              {isResending ? 'Resending...' : 'Resend OTP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OTP;
