"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const res = await fetch("http://localhost:8080/api/v1/auth/login", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        await login(data.access_token);
        router.push("/");
      } else {
        const errData = await res.json();
        setError(errData.detail || "Geçersiz kullanıcı adı veya şifre.");
      }
    } catch (err) {
      setError("Bağlantı hatası. Lütfen backend'in çalıştığından emin olun.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    const clientId = "886266744076-f301q1e5idbatl9p6v4p7q6n81vdisk9.apps.googleusercontent.com";
    const redirectUri = "http://localhost:3000/login";
    const scope = "openid email profile";
    const responseType = "id_token";
    const nonce = Math.random().toString(36).substring(7);

    // Persist nonce for verification after redirect
    localStorage.setItem("google_auth_nonce", nonce);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=${responseType}&scope=${scope}&nonce=${nonce}`;

    window.location.href = googleAuthUrl;
  };

  useEffect(() => {
    // 1. Check if we just returned from Google with an ID token in the hash
    const hash = window.location.hash;
    if (hash && hash.includes("id_token=")) {
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get("id_token");

      if (idToken) {
        setIsSubmitting(true);
        const storedNonce = localStorage.getItem("google_auth_nonce");
        fetch("http://localhost:8080/api/v1/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: idToken,
            nonce: storedNonce
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.access_token) {
              localStorage.removeItem("google_auth_nonce");
              login(data.access_token).then(() => {
                window.location.hash = ""; // Clean the URL
                router.push("/");
              });
            } else {
              setError(data.detail || "Google doğrulaması başarısız oldu.");
            }
          })
          .catch(() => setError("Bağlantı hatası."))
          .finally(() => setIsSubmitting(false));
      }
    }

    // 2. Check if we have a token from a backend redirect (fallback)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    if (tokenFromUrl) {
      login(tokenFromUrl).then(() => router.push("/"));
    }
  }, [login, router]);

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#09090b] text-white selection:bg-cyan-500/30">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md p-8 relative z-10">
        {/* Logo/Brand */}
        <div className="text-center mb-10 space-y-2">
          <div className="inline-block p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 mb-4">
            <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Trinity Intelligence
          </h1>
          <p className="text-gray-500 text-sm">Enterprise Churn & CLV Platform</p>
        </div>

        {/* Login Card (Glassmorphism) */}
        <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.08] p-8 rounded-3xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-widest ml-1">Kullanıcı Adı</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all placeholder:text-gray-700"
                placeholder="admin"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-widest ml-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all placeholder:text-gray-700"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>Giriş Yap</span>
              )}
            </button>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-gray-600"><span className="bg-[#0c0c0e] px-2">OR</span></div>
            </div>

            <button
              onClick={handleGoogleLogin}
              type="button"
              className="w-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center space-x-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>

          {/* Helper info for dev */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest bg-white/[0.02] py-2 rounded-lg">
              Test Hesabı: admin / trinity123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
