import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { User, Role } from '../types';
import { authService } from '../services/authService';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (email: string, passwordHash: string) => Promise<boolean>;
  logout: () => void;
  hasRole: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load session on startup
    const checkSession = async () => {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
      setIsLoading(false);
    };
    checkSession();
  }, []);

  const login = async (email: string, passwordHash: string): Promise<boolean> => {
    setIsLoading(true);
    const user = await authService.login(email, passwordHash);
    setCurrentUser(user);
    setIsLoading(false);
    return !!user;
  };

  const logout = async () => {
    setIsLoading(true);
    await authService.logout();
    setCurrentUser(null);
    setIsLoading(false);
  };

  const hasRole = (roles: Role[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
