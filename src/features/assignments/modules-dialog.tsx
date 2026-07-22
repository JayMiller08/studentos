import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useCreateModule, useDeleteModule, useModules } from '@/features/assignments/hooks'
import { MODULE_COLORS } from '@/services/modules-service'
import { cn } from '@/lib/utils'

const moduleSchema = z.object({
  name: z.string().trim().min(2, 'Module name is required').max(120),
  code: z.string().trim().max(20),
  color: z.string(),
})
type ModuleValues = z.infer<typeof moduleSchema>

interface ModulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Manage the user's modules (courses) — create with color, delete. */
export function ModulesDialog({ open, onOpenChange }: ModulesDialogProps) {
  const { data: modules = [] } = useModules()
  const createModule = useCreateModule()
  const deleteModule = useDeleteModule()

  const form = useForm<ModuleValues>({
    resolver: zodResolver(moduleSchema),
    defaultValues: { name: '', code: '', color: MODULE_COLORS[0] },
  })

  async function onSubmit(values: ModuleValues) {
    await createModule.mutateAsync({
      name: values.name,
      code: values.code || null,
      color: values.color,
    })
    form.reset({ name: '', code: '', color: values.color })
    toast.success('Module added')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your modules</DialogTitle>
          <DialogDescription>
            Modules group assignments, classes and notes. Deleting a module keeps its assignments.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2" aria-label="Modules">
          {modules.map((module) => (
            <li key={module.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: module.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{module.name}</p>
                {module.code ? (
                  <p className="text-muted-foreground text-xs">{module.code}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${module.name}`}
                onClick={() => {
                  deleteModule.mutate(module.id, {
                    onSuccess: () => toast.success('Module deleted'),
                  })
                }}
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </li>
          ))}
          {modules.length === 0 ? (
            <li className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              No modules yet — add your first one below.
            </li>
          ) : null}
        </ul>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 border-t pt-4" noValidate>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Data Structures" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="CSC2001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Module color">
                      {MODULE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={field.value === color}
                          aria-label={`Color ${color}`}
                          onClick={() => field.onChange(color)}
                          className={cn(
                            'size-7 rounded-full border-2 transition-transform',
                            field.value === color
                              ? 'border-foreground scale-110'
                              : 'border-transparent hover:scale-105',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={createModule.isPending} className="w-full">
              <Plus /> Add module
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
