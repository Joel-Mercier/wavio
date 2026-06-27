import Foundation
import ObjectiveC.runtime

/// Installs `SslTrustURLProtocol` so it covers *all* URLSession traffic, not
/// just `URLSession.shared`.
///
/// `URLProtocol.registerClass` only affects the shared session and
/// NSURLConnection. React Native, expo-image and expo-file-system create
/// sessions from custom configurations, which consult
/// `URLSessionConfiguration.protocolClasses`. So we swizzle the `default` and
/// `ephemeral` configuration factories to prepend our protocol class.
enum SslTrustSwizzle {
  private static var installed = false

  static func install() {
    guard !installed else { return }
    installed = true

    URLProtocol.registerClass(SslTrustURLProtocol.self)
    swizzle(selector: #selector(getter: URLSessionConfiguration.default))
    swizzle(selector: #selector(getter: URLSessionConfiguration.ephemeral))
  }

  private static func swizzle(selector: Selector) {
    let cls: AnyClass = object_getClass(URLSessionConfiguration.self)!
    guard let original = class_getClassMethod(cls, selector) else { return }

    let swizzledSelector = Selector("ssl_\(selector)")
    let block: @convention(block) (AnyObject) -> URLSessionConfiguration = { _ in
      // Call the original (now under the swizzled selector) and inject our
      // protocol class at the front of the chain.
      let config = originalConfiguration(cls: cls, selector: swizzledSelector)
      var classes = config.protocolClasses ?? []
      if !classes.contains(where: { $0 == SslTrustURLProtocol.self }) {
        classes.insert(SslTrustURLProtocol.self, at: 0)
      }
      config.protocolClasses = classes
      return config
    }
    let implementation = imp_implementationWithBlock(block)
    let types = method_getTypeEncoding(original)
    class_addMethod(cls, swizzledSelector, method_getImplementation(original), types)
    method_setImplementation(original, implementation)
  }

  private static func originalConfiguration(
    cls: AnyClass, selector: Selector
  ) -> URLSessionConfiguration {
    let method = class_getClassMethod(cls, selector)!
    typealias Fn = @convention(c) (AnyObject, Selector) -> URLSessionConfiguration
    let imp = unsafeBitCast(method_getImplementation(method), to: Fn.self)
    return imp(URLSessionConfiguration.self, selector)
  }
}
