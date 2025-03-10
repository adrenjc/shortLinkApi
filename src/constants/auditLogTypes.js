/**
 * 审计日志操作类型枚举
 */
exports.ACTION_TYPES = {
  // 短链接相关
  CREATE_LINK: "CREATE_LINK",
  UPDATE_LINK: "UPDATE_LINK",
  DELETE_LINK: "DELETE_LINK",
  CLICK_LINK: "CLICK_LINK",

  // 用户相关
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  REGISTER: "REGISTER",
  UPDATE_PASSWORD: "UPDATE_PASSWORD",
  USER_UPDATE: "USER_UPDATE",
  USER_CREATE: "USER_CREATE",
  USER_DELETE: "USER_DELETE",

  // 角色相关
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_UPDATE: "ROLE_UPDATE",
  ROLE_DELETE: "ROLE_DELETE",

  // 域名相关
  CREATE_DOMAIN: "CREATE_DOMAIN",
  UPDATE_DOMAIN: "UPDATE_DOMAIN",
  DELETE_DOMAIN: "DELETE_DOMAIN",
  VERIFY_DOMAIN: "VERIFY_DOMAIN",
  DOMAIN_VERIFY: "DOMAIN_VERIFY",

  // SSL 证书相关
  SSL_CERTIFICATE_ISSUED: "SSL_CERTIFICATE_ISSUED",
  SSL_CERTIFICATE_RENEWED: "SSL_CERTIFICATE_RENEWED",
  SSL_CERTIFICATE_ERROR: "SSL_CERTIFICATE_ERROR",

  // 角色分配相关
  ASSIGN_ROLE: "ASSIGN_ROLE",
  REVOKE_ROLE: "REVOKE_ROLE",

  // 权限相关
  CREATE_PERMISSION: "CREATE_PERMISSION",
  UPDATE_PERMISSION: "UPDATE_PERMISSION",
  DELETE_PERMISSION: "DELETE_PERMISSION",
}

/**
 * 资源类型枚举
 */
exports.RESOURCE_TYPES = {
  LINK: "LINK",
  USER: "USER",
  ROLE: "ROLE",
  DOMAIN: "DOMAIN",
}
