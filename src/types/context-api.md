# Frontend Context API Documentation

This document provides comprehensive guidance on using the FlexPress frontend context API for state management and authentication.

## Overview

The FlexPress frontend context API provides:
- **Authentication state management**
- **User context** with role information
- **Role-based access control** helpers
- **Custom hooks** for easy access to common functionality

## Installation

### 1. Install Required Dependencies

```bash
npm install react react-dom @types/react @types/react-dom
# or
yarn add react react-dom @types/react @types/react-dom
# or
pnpm add react react-dom @types/react @types/react-dom
```

### 2. Copy Type Definitions

Copy the following files to your frontend project:
- `src/types/api.types.ts` - All TypeScript interfaces
- `src/types/api-client.ts` - HTTP API client

## Usage

### 1. Setup the Provider

Wrap your app with the `AppProvider`:

```tsx
import { AppProvider } from './types/context';

function App() {
  return (
    <AppProvider>
      {/* Your app components */}
    </AppProvider>
  );
}

export default App;
```

### 2. Authentication Hook

Use the `useAuth` hook for authentication operations:

#### Registration

```tsx
import { useAuth } from './types/context';

function RegisterComponent() {
  const { register, isLoading, error } = useAuth();

  const handleRegister = async (userData) => {
    try {
      await register(userData);
      // Redirect to login or show success message
    } catch (error) {
      // Handle error
    }
  };

  return (
    <form onSubmit={handleRegister}>
      {error && <div className="error">{error}</div>}
      {isLoading && <div>Loading...</div>}
      {/* Registration form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Registering...' : 'Register'}
      </button>
    </form>
  );
}
```

**Note**: The register endpoint only allows `user` and `charter` roles. Admin and subadmin accounts cannot be created through registration.

#### Login

```tsx
import { useAuth } from './types/context';

function LoginComponent() {
  const { login, isLoading, error, user, isAuthenticated } = useAuth();

  const handleLogin = async (credentials) => {
    try {
      await login(credentials);
      // Redirect or show success message
    } catch (error) {
      // Handle error
    }
  };

  if (isAuthenticated) {
    return <div>Welcome, {user?.name}!</div>;
  }

  return (
    <form onSubmit={handleLogin}>
      {error && <div className="error">{error}</div>}
      {isLoading && <div>Loading...</div>}
      {/* Login form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### 3. Role-Based Access Control

Use the `useRole` hook to check user permissions:

```tsx
import { useRole } from './types/context';

function AdminPanel() {
  const { hasRole, hasAnyRole } = useRole();

  // Check for specific role
  if (!hasRole('admin')) {
    return <div>Access denied. Admin privileges required.</div>;
  }

  // Check for multiple roles
  if (!hasAnyRole(['admin', 'subadmin'])) {
    return <div>Access denied. Administrative privileges required.</div>;
  }

  return (
    <div>
      <h1>Admin Panel</h1>
      {/* Admin content */}
    </div>
  );
}

function CharterService() {
  const { hasRole } = useRole();

  if (!hasRole('charter')) {
    return <div>This service is only available for charter providers.</div>;
  }

  return (
    <div>
      <h1>Charter Service Dashboard</h1>
      {/* Charter-specific content */}
    </div>
  );
}
```

### 4. User Information Hook

Use the `useUser` hook to access user data:

```tsx
import { useUser } from './types/context';

function UserProfile() {
  const { user, isAuthenticated } = useUser();

  if (!isAuthenticated) {
    return <div>Please log in to view your profile.</div>;
  }

  return (
    <div>
      <h1>User Profile</h1>
      <div>
        <strong>Name:</strong> {user?.name}
      </div>
      <div>
        <strong>Email:</strong> {user?.email}
      </div>
      <div>
        <strong>Role:</strong> {user?.role}
      </div>
      <div>
        <strong>Credits:</strong> {user?.credits}
      </div>
      <div>
        <strong>Address:</strong> {user?.address}
      </div>
    </div>
  );
}
```

### 5. Complete Context Usage

Access the full context when you need multiple pieces of state:

```tsx
import { useApp } from './types/context';

function Dashboard() {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    error, 
    login, 
    logout, 
    hasRole, 
    hasAnyRole,
    clearError 
  } = useApp();

  const handleLogout = () => {
    logout();
    // Redirect to login page
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in to access the dashboard.</div>;
  }

  return (
    <div>
      <header>
        <h1>Welcome, {user?.name}!</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>

      {error && (
        <div className="error">
          {error}
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}

      <main>
        {hasRole('admin') && <AdminSection />}
        {hasRole('user') && <UserSection />}
        {hasRole('charter') && <CharterSection />}
      </main>
    </div>
  );
}
```

## API Client Usage

### Basic API Operations

```tsx
import { apiClient } from './types/api-client';

function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getUsers(1, 10);
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) return <div>Loading users...</div>;

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
          <p>Role: {user.role}</p>
        </div>
      ))}
    </div>
  );
}
```

### Pagination Handling

```tsx
import { PaginatedResponse, User } from './types/api.types';

function PaginatedUserList() {
  const [userResponse, setUserResponse] = useState<PaginatedResponse<User> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async (pageNum: number) => {
    setLoading(true);
    try {
      const response = await apiClient.getUsers(pageNum, 10);
      setUserResponse(response);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchUsers(newPage);
  };

  useEffect(() => {
    fetchUsers(page);
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!userResponse) return <div>No data available</div>;

  return (
    <div>
      <div className="users-list">
        {userResponse.data.map(user => (
          <div key={user.id} className="user-card">
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <p>Role: {user.role}</p>
          </div>
        ))}
      </div>
      
      <div className="pagination">
        <button 
          disabled={!userResponse.meta.hasPreviousPage}
          onClick={() => handlePageChange(page - 1)}
        >
          Previous
        </button>
        
        <span className="page-info">
          Page {page} of {userResponse.meta.totalPages}
        </span>
        
        <button 
          disabled={!userResponse.meta.hasNextPage}
          onClick={() => handlePageChange(page + 1)}
        >
          Next
        </button>
      </div>
      
      <div className="pagination-stats">
        Total: {userResponse.meta.total} users
      </div>
    </div>
  );
}
```

### CRUD Operations

```tsx
import { apiClient } from './types/api-client';
import { CreateUserRequest, UpdateUserRequest } from './types/api.types';

function UserManagement() {
  const [users, setUsers] = useState([]);

  // Create user
  const handleCreateUser = async (userData: CreateUserRequest) => {
    try {
      const newUser = await apiClient.createUser(userData);
      setUsers(prev => [...prev, newUser]);
      alert('User created successfully!');
    } catch (error) {
      console.error('Failed to create user:', error);
      alert('Failed to create user');
    }
  };

  // Update user
  const handleUpdateUser = async (id: string, userData: UpdateUserRequest) => {
    try {
      const updatedUser = await apiClient.updateUser(id, userData);
      setUsers(prev => prev.map(user => 
        user.id === id ? updatedUser : user
      ));
      alert('User updated successfully!');
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('Failed to update user');
    }
  };

  // Delete user
  const handleDeleteUser = async (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await apiClient.deleteUser(id);
        setUsers(prev => prev.filter(user => user.id !== id));
        alert('User deleted successfully!');
      } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user');
      }
    }
  };

  return (
    <div>
      {/* User creation form */}
      {/* User list with edit/delete buttons */}
    </div>
  );
}
```

## Error Handling

### Global Error Handling

```tsx
import { useApp } from './types/context';

function App() {
  const { error, clearError } = useApp();

  return (
    <div>
      {error && (
        <div className="global-error">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}
      
      {/* Your app content */}
    </div>
  );
}
```

### API Error Handling

```tsx
import { apiClient } from './types/api-client';

async function safeApiCall() {
  try {
    const result = await apiClient.getUsers(1, 10);
    return result;
  } catch (error) {
    if (error.message.includes('Unauthorized')) {
      // Handle authentication error
      window.location.href = '/login';
    } else if (error.message.includes('Not Found')) {
      // Handle not found error
      console.error('Resource not found');
    } else {
      // Handle other errors
      console.error('API call failed:', error);
    }
    throw error;
  }
}
```

## Best Practices

### 1. Component Organization

```tsx
// Separate concerns into different components
function UserDashboard() {
  const { user, hasRole } = useApp();

  return (
    <div>
      <UserHeader user={user} />
      <UserNavigation />
      
      {hasRole('admin') && <AdminPanel />}
      {hasRole('user') && <UserPanel />}
      {hasRole('charter') && <CharterPanel />}
    </div>
  );
}
```

### 2. Custom Hooks for Complex Logic

```tsx
function useUserData(userId: string) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const userData = await apiClient.getUserById(userId);
        setUser(userData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchUser();
    }
  }, [userId]);

  return { user, loading, error };
}
```

### 3. Loading States

```tsx
function LoadingWrapper({ loading, children, fallback = <div>Loading...</div> }) {
  if (loading) {
    return fallback;
  }
  return children;
}

function UserProfile() {
  const { user, isLoading } = useUser();
  
  return (
    <LoadingWrapper loading={isLoading}>
      <div>
        <h1>{user?.name}</h1>
        <p>{user?.email}</p>
      </div>
    </LoadingWrapper>
  );
}
```

## Troubleshooting

### Common Issues

1. **Module not found errors**: Ensure all dependencies are installed
2. **TypeScript errors**: Check that types are properly imported
3. **Authentication issues**: Verify JWT token is being sent correctly
4. **CORS errors**: Ensure backend CORS is configured properly

### Debug Mode

Enable debug logging in your API client:

```tsx
// In api-client.ts, add console.log statements for debugging
private async handleResponse<T>(response: Response): Promise<T> {
  console.log('API Response:', response.status, response.url);
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error);
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  console.log('API Result:', result);
  
  if (result.data !== undefined) {
    return result.data;
  }
  
  return result;
}
```

## Conclusion

The FlexPress frontend context API provides a robust foundation for building React applications with authentication, role-based access control, and comprehensive state management. By following the patterns and best practices outlined in this documentation, you can create maintainable and scalable frontend applications that integrate seamlessly with the FlexPress backend. 