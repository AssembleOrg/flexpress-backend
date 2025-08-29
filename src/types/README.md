# Frontend Context API and Types

This directory contains TypeScript types and React context API for the FlexPress frontend application.

## Files

### `api.types.ts`
Contains all TypeScript interfaces and types for the API:
- Base entity types
- User, Trip, Payment, and SystemConfig interfaces
- Request/Response DTOs
- Pagination types
- Authentication types
- Error handling types

### `api-client.ts`
A comprehensive API client class that provides:
- Authentication methods (login, logout)
- CRUD operations for all entities
- Pagination support
- Error handling
- Token management
- Utility methods for system configuration

### `context-api.md`
Comprehensive documentation for the frontend context API including:
- Authentication state management
- User data context
- Role-based access control
- Custom hooks for easy state access
- Complete usage examples and best practices

## Usage in React Frontend

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
```

### 2. Use Authentication

```tsx
import { useAuth } from './types/context';

function LoginComponent() {
  const { login, isLoading, error } = useAuth();

  const handleLogin = async (credentials) => {
    try {
      await login(credentials);
      // Redirect or show success message
    } catch (error) {
      // Handle error
    }
  };

  return (
    <form onSubmit={handleLogin}>
      {/* Login form */}
    </form>
  );
}
```

### 3. Check User Roles

```tsx
import { useRole } from './types/context';

function AdminPanel() {
  const { hasRole, hasAnyRole } = useRole();

  if (!hasRole('admin')) {
    return <div>Access denied</div>;
  }

  return (
    <div>
      {/* Admin content */}
    </div>
  );
}
```

### 4. Use API Client

```tsx
import { apiClient } from './types/api-client';

function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.getUsers(1, 10);
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### 5. Handle Pagination

```tsx
import { PaginatedResponse, User } from './types/api.types';

function PaginatedUserList() {
  const [userResponse, setUserResponse] = useState<PaginatedResponse<User> | null>(null);
  const [page, setPage] = useState(1);

  const fetchUsers = async (pageNum: number) => {
    try {
      const response = await apiClient.getUsers(pageNum, 10);
      setUserResponse(response);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchUsers(newPage);
  };

  if (!userResponse) return <div>Loading...</div>;

  return (
    <div>
      {userResponse.data.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
      
      <div>
        <button 
          disabled={!userResponse.meta.hasPreviousPage}
          onClick={() => handlePageChange(page - 1)}
        >
          Previous
        </button>
        <span>Page {page} of {userResponse.meta.totalPages}</span>
        <button 
          disabled={!userResponse.meta.hasNextPage}
          onClick={() => handlePageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

## Environment Configuration

Create a `.env` file in your frontend project:

```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_ENVIRONMENT=development
```

## Error Handling

The API client automatically handles common HTTP errors and provides meaningful error messages in Spanish as specified in the backend requirements.

## Type Safety

All API calls are fully typed, providing:
- IntelliSense support
- Compile-time error checking
- Runtime type safety
- Automatic type inference

## Customization

You can create custom instances of the API client with different base URLs:

```tsx
import ApiClient from './types/api-client';

const customApiClient = new ApiClient('https://api.production.com');
```

## Notes

- The context API automatically manages authentication tokens
- All API responses follow the standardized format from the backend
- Role-based access control is built into the context
- The API client handles CORS and authentication headers automatically 