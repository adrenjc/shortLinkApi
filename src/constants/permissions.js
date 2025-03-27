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
  LINK_VIEW_ALL: "link:view:all",

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

  // 权限管理权限组
  {
    code: PERMISSION_CODES.PERMISSION_VIEW,
    name: "权限查看",
    description: "查看权限列表和权限详情",
    type: "operation",
    group: "权限管理",
  },
  {
    code: PERMISSION_CODES.PERMISSION_CREATE,
    name: "权限创建",
    description: "创建新的权限",
    type: "operation",
    group: "权限管理",
  },
  {
    code: PERMISSION_CODES.PERMISSION_UPDATE,
    name: "权限编辑",
    description: "编辑权限信息",
    type: "operation",
    group: "权限管理",
  },
  {
    code: PERMISSION_CODES.PERMISSION_DELETE,
    name: "权限删除",
    description: "删除已有权限",
    type: "operation",
    group: "权限管理",
  },

  // 域名管理权限组
  {
    code: PERMISSION_CODES.DOMAIN_VIEW,
    name: "域名查看",
    description: "查看域名列表和域名详情",
    type: "operation",
    group: "域名管理",
  },
  {
    code: PERMISSION_CODES.DOMAIN_CREATE,
    name: "域名创建",
    description: "添加新的域名",
    type: "operation",
    group: "域名管理",
  },
  {
    code: PERMISSION_CODES.DOMAIN_UPDATE,
    name: "域名编辑",
    description: "编辑域名信息",
    type: "operation",
    group: "域名管理",
  },
  {
    code: PERMISSION_CODES.DOMAIN_DELETE,
    name: "域名删除",
    description: "删除已有域名",
    type: "operation",
    group: "域名管理",
  },
  {
    code: PERMISSION_CODES.DOMAIN_VERIFY,
    name: "域名验证",
    description: "验证域名所有权",
    type: "operation",
    group: "域名管理",
  },
  {
    code: PERMISSION_CODES.DOMAIN_MANAGE,
    name: "域名管理",
    description: "域名全部管理权限",
    type: "operation",
    group: "域名管理",
  },

  // 短链接管理权限组
  {
    code: PERMISSION_CODES.LINK_VIEW,
    name: "短链查看",
    description: "查看短链列表和详情",
    type: "operation",
    group: "短链管理",
  },
  {
    code: PERMISSION_CODES.LINK_CREATE,
    name: "短链创建",
    description: "创建新的短链",
    type: "operation",
    group: "短链管理",
  },
  {
    code: PERMISSION_CODES.LINK_UPDATE,
    name: "短链编辑",
    description: "编辑短链信息",
    type: "operation",
    group: "短链管理",
  },
  {
    code: PERMISSION_CODES.LINK_DELETE,
    name: "短链删除",
    description: "删除已有短链",
    type: "operation",
    group: "短链管理",
  },
  {
    code: PERMISSION_CODES.LINK_MANAGE,
    name: "短链管理",
    description: "短链全部管理权限",
    type: "operation",
    group: "短链管理",
  },
  {
    code: PERMISSION_CODES.LINK_VIEW_ALL,
    name: "查看所有短链",
    description: "查看所有用户创建的短链接及创建者信息",
    type: "operation",
    group: "短链管理",
  },

  // 审计日志权限组
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
