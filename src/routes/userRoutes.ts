import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserDirectory,
} from '../controllers/userController';
import { getMyDashboard, saveMyDashboard } from '../controllers/dashboardLayoutController';
import authMiddleware from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// All user routes are protected
router.use(authMiddleware);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     description: Create a new user with username, email, password, and role
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: SecurePass123!
 *               role:
 *                 type: string
 *                 description: Role ID
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       409:
 *         description: User already exists
 *       400:
 *         description: Invalid role ID
 *       401:
 *         description: Unauthorized
 */
router.post('/', requirePermission('admin.users', 'create'), createUser);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve all users with populated role data
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get('/', requirePermission('admin.users', 'read'), getAllUsers);

/**
 * @swagger
 * /api/users/directory:
 *   get:
 *     summary: Minimal list of users (id and names only) for pickers such as surveyor assignment
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User directory
 */
router.get('/directory', getUserDirectory);

/**
 * @swagger
 * /api/users/me/dashboard:
 *   get:
 *     summary: The signed-in user's home dashboard layout (null = default layout)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Save the signed-in user's dashboard layout
 *     description: "Body: { widgets: [{ id, size: 'sm' | 'md' | 'lg' }] } in display order, or { widgets: null } to reset."
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
// Registered before /:id so "me" isn't read as a user id.
router.get('/me/dashboard', getMyDashboard);
router.put('/me/dashboard', saveMyDashboard);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a single user by their ID with populated role
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     description: Update user fields (username, email, password, role)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe_updated
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john_updated@example.com
 *               password:
 *                 type: string
 *                 example: NewSecurePass123!
 *               role:
 *                 type: string
 *                 description: Role ID
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       409:
 *         description: Duplicate field value
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user by their ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', requirePermission('admin.users', 'delete'), deleteUser);

export default router;
