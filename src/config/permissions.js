/**
 * 系统权限配置
 *
 * type:
 * - operation: 操作权限
 * - menu: 菜单权限（预留）
 */

const permissions = [
  // 用户管理权限组
  {
    name: "用户查看",
    code: "user:view",
    type: "operation",
    description: "查看用户列表和用户详情",
    group: "用户管理",
  },
  {
    name: "用户编辑",
    code: "user:update",
    type: "operation",
    description: "编辑用户信息，包括角色分配",
    group: "用户管理",
  },

  // 角色管理权限组
  {
    name: "角色查看",
    code: "role:view",
    type: "operation",
    description: "查看角色列表和角色详情",
    group: "角色管理",
  },
  {
    name: "角色创建",
    code: "role:create",
    type: "operation",
    description: "创建新的角色",
    group: "角色管理",
  },
  {
    name: "角色编辑",
    code: "role:update",
    type: "operation",
    description: "编辑角色信息和权限",
    group: "角色管理",
  },
  {
    name: "角色删除",
    code: "role:delete",
    type: "operation",
    description: "删除已有角色",
    group: "角色管理",
  },

  // 业务功能权限组
  {
    name: "短链管理",
    code: "link:manage",
    type: "operation",
    description: "创建、编辑、删除和查看短链",
    group: "业务功能",
  },
  {
    name: "域名管理",
    code: "domain:manage",
    type: "operation",
    description: "添加、验证和管理自定义域名",
    group: "业务功能",
  },

  // 系统管理权限组
  {
    name: "审计日志",
    code: "audit:view",
    type: "operation",
    description: "查看审计日志和统计信息",
    group: "系统管理",
  },
]

module.exports = permissions
