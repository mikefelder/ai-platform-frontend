# -----------------------------------------------------------------------------
# Platform / ALZ references
# -----------------------------------------------------------------------------

variable "subscription_id" {
  description = "Azure subscription ID."
  type        = string
}

variable "resource_group_name" {
  description = "Name of the ALZ resource group."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "australiaeast"
}

variable "container_app_environment_name" {
  description = "Name of the Container App Environment."
  type        = string
}

variable "container_registry_name" {
  description = "Name of the Azure Container Registry."
  type        = string
}

# -----------------------------------------------------------------------------
# Frontend workload configuration
# -----------------------------------------------------------------------------

variable "frontend_image_tag" {
  description = "Container image tag for the frontend."
  type        = string
  default     = "latest"
}

variable "tags" {
  description = "Tags to apply to all resources."
  type        = map(string)
  default = {
    workload = "uaip-frontend"
    program  = "uaip"
  }
}
