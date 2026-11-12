import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('leadflow_token'));
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem('leadflow_user') || 'null'),
  );
  const [organization, setOrganization] = useState(
    JSON.parse(localStorage.getItem('leadflow_organization') || 'null'),
  );

  const saveSession = useCallback((session) => {
    localStorage.setItem('leadflow_token', session.token);
    localStorage.setItem('leadflow_user', JSON.stringify(session.user));
    localStorage.setItem('leadflow_organization', JSON.stringify(session.organization));

    setToken(session.token);
    setUser(session.user);
    setOrganization(session.organization);
  }, []);

  const login = useCallback(async (credentials) => {
    const session = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    saveSession(session);
  }, [saveSession]);

  const register = useCallback(async (details) => {
    const session = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(details),
    });

    saveSession(session);
  }, [saveSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('leadflow_token');
    localStorage.removeItem('leadflow_user');
    localStorage.removeItem('leadflow_organization');

    setToken(null);
    setUser(null);
    setOrganization(null);
  }, []);

  const value = useMemo(() => ({
    token,
    user,
    organization,
    isAuthenticated: Boolean(token && user && organization),
    login,
    register,
    logout,
  }), [token, user, organization, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
