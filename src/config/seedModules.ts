import Module from '../models/Module';
import Role from '../models/Role';

export const seedModulesAndAdminPermissions = async () => {
  try {
    const modulesCount = await Module.countDocuments();
    let allModules: any[] = [];
    
    if (modulesCount === 0) {
      console.log('🌱 Seeding initial modules...');
      const reporting = await Module.create({ name: 'Reporting', description: 'Reporting Module' });
      const hr = await Module.create({ name: 'HR', description: 'Human Resources Module' });
      const admin = await Module.create({ name: 'Admin', description: 'Admin Module' });
      const finance = await Module.create({ name: 'Finance', description: 'Finance Module' });
      
      const marine = await Module.create({ name: 'Marine', description: 'Marine Sub-module', parentId: reporting._id });
      const industrial = await Module.create({ name: 'Industrial', description: 'Industrial Sub-module', parentId: reporting._id });

      allModules = [reporting, hr, admin, finance, marine, industrial];
      console.log('✅ Modules seeded successfully.');
    } else {
      allModules = await Module.find();
    }

    // Assign all modules to admin role
    const adminRole = await Role.findOne({ roleName: 'admin' });
    if (adminRole) {
      const allActions = ['create', 'read', 'update', 'delete'];
      const permissions = allModules.map(mod => ({
        module: mod._id,
        actions: allActions
      }));
      adminRole.permissions = permissions;
      await adminRole.save();
      console.log('✅ Admin role permissions ensured.');
    }
  } catch (error) {
    console.error('❌ Error seeding modules:', error);
  }
};
