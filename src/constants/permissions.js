/**
 * 系统权限定义
 *
 * 每个权限包含：
 * - code: 权限代码，用于程序判断
 * - name: 权限名称，用于显示
 * - description: 权限描述
 * - type: 权限类型 (operation: 操作权限 | menu: 菜单权限)
 * - group: 权限分组
 */

// 权限代码常量
const PERMISSION_CODES = {
  // 用户管理
  USER_VIEW: "user:view",
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",

  // 角色管理
  ROLE_VIEW: "role:view",
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
  ROLE_DELETE: "role:delete",

  // 权限管理
  PERMISSION_VIEW: "permission:view",
  PERMISSION_CREATE: "permission:create",
  PERMISSION_UPDATE: "permission:update",
  PERMISSION_DELETE: "permission:delete",

  // 域名管理
  DOMAIN_VIEW: "domain:view",
  DOMAIN_CREATE: "domain:create",
  DOMAIN_UPDATE: "domain:update",
  DOMAIN_DELETE: "domain:delete",
  DOMAIN_VERIFY: "domain:verify",
  DOMAIN_MANAGE: "domain:manage",

  // 短链接管理
  LINK_VIEW: "link:view",
  LINK_CREATE: "link:create",
  LINK_UPDATE: "link:update",
  LINK_DELETE: "link:delete",
  LINK_MANAGE: "link:manage",

  // 审计日志
  AUDIT_VIEW: "audit:view",
}

// 权限配置（包含元数据）
const PERMISSIONS = [
  // 用户管理权限组
  {
    code: PERMISSION_CODES.USER_VIEW,
    name: "用户查看",
    description: "查看用户列表和用户详情",
    type: "operation",
    group: "用户管理",
  },
  {
    code: PERMISSION_CODES.USER_CREATE,
    name: "用户创建",
    description: "创建新用户",
    type: "operation",
    group: "用户管理",
  },
  {
    code: PERMISSION_CODES.USER_UPDATE,
    name: "用户编辑",
    description: "编辑用户信息，包括角色分配",
    type: "operation",
    group: "用户管理",
  },
  {
    code: PERMISSION_CODES.USER_DELETE,
    name: "用户删除",
    description: "删除用户",
    type: "operation",
    group: "用户管理",
  },

  // 角色管理权限组
  {
    code: PERMISSION_CODES.ROLE_VIEW,
    name: "角色查看",
    description: "查看角色列表和角色详情",
    type: "operation",
    group: "角色管理",
  },
  {
    code: PERMISSION_CODES.ROLE_CREATE,
    name: "角色创建",
    description: "创建新的角色",
    type: "operation",
    group: "角色管理",
  },
  {
    code: PERMISSION_CODES.ROLE_UPDATE,
    name: "角色编辑",
    description: "编辑角色信息和权限",
    type: "operation",
    group: "角色管理",
  },
  {
    code: PERMISSION_CODES.ROLE_DELETE,
    name: "角色删除",
    description: "删除已有角色",
    type: "operation",
    group: "角色管理",
  },

  // 业务功能权限组
  {
    code: PERMISSION_CODES.LINK_MANAGE,
    name: "短链管理",
    description: "创建、编辑、删除和查看短链",
    type: "operation",
    group: "业务功能",
  },
  {
    code: PERMISSION_CODES.DOMAIN_MANAGE,
    name: "域名管理",
    description: "添加、验证和管理自定义域名",
    type: "operation",
    group: "业务功能",
  },

  // 系统管理权限组
  {
    code: PERMISSION_CODES.AUDIT_VIEW,
    name: "审计日志",
    description: "查看审计日志和统计信息",
    type: "operation",
    group: "系统管理",
  },
]

module.exports = {
  PERMISSION_CODES,
  PERMISSIONS,
}
