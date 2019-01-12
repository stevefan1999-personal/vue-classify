import * as t from '@babel/types'
import { log } from './utils'
import { NodePath } from 'babel-traverse'

const nestedPropsVisitor = {
  ObjectProperty(path: NodePath<t.ObjectProperty>) {
    const parentKey = path.parentPath.parent.key
    if (parentKey && parentKey.name === this.childKey) {
      const key = path.node.key
      const node = path.node.value
      // console.log('key node', key, node)
      const stateProp = this.state.props[this.childKey]

      if (key.name === 'type') {
        if (t.isIdentifier(node)) {
          this.state.props[this.childKey].type = node.name.toLowerCase()
        } else if (t.isArrayExpression(node)) {
          const elements = []
          node.elements.forEach(n => {
            elements.push(n.name.toLowerCase())
          })
          if (!elements.length) {
            log(`Providing a type for the ${this.childKey} prop is a good practice.`)
          }
          /**
           * supports following syntax:
           * propKey: { type: [Number, String], default: 0}
           */
          this.state.props[this.childKey].type =
            elements.length > 1 ? 'typesOfArray' : elements[0] ? elements[0].toLowerCase() : elements
          this.state.props[this.childKey].value = elements.length > 1 ? elements : elements[0] ? elements[0] : elements
        } else {
          log(`The type in ${this.childKey} prop only supports identifier or array expression, eg: Boolean, [String]`)
        }
      }

      if (key.name === 'default') {
        if (t.isFunctionExpression(node)) {
          stateProp.default = node
        }
      }

      if (key.name === 'validator') {
        if (t.isFunctionExpression(node)) {
          stateProp.validator = node
        }
      }

      if (t.isLiteral(node)) {
        if (key.name === 'default') {
          if (this.state.props[this.childKey].type === 'typesOfArray') {
            this.state.props[this.childKey].defaultValue = node.value
          } else {
            this.state.props[this.childKey].value = node.value
          }
        }

        if (key.name === 'required') {
          this.state.props[this.childKey].required = node.value
        }
      }
    }
  },

  ObjectMethod(path) {
    const nodeKeyName = path.node.key.name
    if (nodeKeyName === 'default') {
      const stateProp = this.state.props[this.childKey]
      if (stateProp && !stateProp.default) {
        stateProp.default = path.node
      }
    }
  },

  ArrowFunctionExpression(path) {
    const parentKey = path.parentPath.parentPath.parent.key
    if (parentKey && parentKey.name === this.childKey) {
      const body = path.node.body
      if (t.isArrayExpression(body)) {
        // Array
        this.state.props[this.childKey].value = body
      } else if (t.isBlockStatement(body)) {
        // Object/Block array
        const childNodes = body.body
        if (childNodes.length === 1 && t.isReturnStatement(childNodes[0])) {
          this.state.props[this.childKey].value = childNodes[0].argument
        }
      }

      // validator
      if (path.parent.key && path.parent.key.name === 'validator') {
        path.traverse(
          {
            ArrayExpression(arrNodePath) {
              this.state.props[this.childKey].validator = arrNodePath.node
            },
          },
          { state: this.state, childKey: this.childKey }
        )
      }
    }
  },
}

export default function collectVueProps(path, state) {
  const childs = path.node.value.properties
  const parentKey = path.node.key.name // props;

  if (childs.length) {
    path.traverse({
      ObjectProperty(propPath: NodePath<t.ObjectProperty>) {
        const parentNode = propPath.parentPath.parent
        if (parentNode.key && parentNode.key.name === parentKey) {
          const childNode = propPath.node
          const childKey = childNode.key.name
          const childVal = childNode.value

          if (!state.props[childKey]) {
            if (t.isArrayExpression(childVal)) {
              const elements = []
              childVal.elements.forEach(node => {
                elements.push(node.name.toLowerCase())
              })
              state.props[childKey] = {
                type: elements.length > 1 ? 'typesOfArray' : elements[0] ? elements[0].toLowerCase() : elements,
                value: elements.length > 1 ? elements : elements[0] ? elements[0] : elements,
                required: false,
                validator: false,
              }
            } else if (t.isObjectExpression(childVal)) {
              state.props[childKey] = {
                type: '',
                value: undefined,
                required: false,
                validator: false,
              }
              path.traverse(nestedPropsVisitor, { state, childKey })
            } else if (t.isIdentifier(childVal)) {
              // supports propKey: type
              state.props[childKey] = {
                type: childVal.name.toLowerCase(),
                value: undefined,
                required: false,
                validator: false,
              }
            } else {
              log(`Not supports expression for the ${this.childKey} prop in props.`)
            }
          }
        }
      },
    })
  }
}
